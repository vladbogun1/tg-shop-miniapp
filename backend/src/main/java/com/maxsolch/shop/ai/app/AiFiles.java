package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFile;
import com.maxsolch.shop.ai.domain.AiFileObjects;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.ChatModel.ImagePart;
import com.maxsolch.shop.ai.infra.AiFileRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.LongFunction;

/**
 * The pictures of documents for the supply reader: upload (checked and re-encoded by {@link AiImagePrep}, stored in the
 * bucket of their own), delete, hand to a task, read by the task, and the nightly removal of what is older than 7 days.
 * One task reads at most {@value #MAX_IMAGES} pictures (a PDF page is one picture): the cost and the answer length grow
 * with every one, and an invoice of more pages is read in two goes. Files are the admin's own: nobody else lists,
 * previews, deletes or attaches them.
 */
@Service
public class AiFiles {

    public static final int MAX_IMAGES = 10;
    private static final int CLEAN_BATCH = 200;

    /** What the screen gets about a stored picture. */
    public record FileDto(long id, String uploadId, String name, String mime, int size, Integer page, Instant expiresAt) {

        static FileDto of(AiFile f) {
            return new FileDto(f.getId(), f.getUploadId(), f.getName(), f.getMime(), f.getSize(), f.getPage(),
                    f.getExpiresAt());
        }
    }

    /** A picture to show in the screen. */
    public record Content(byte[] bytes, String mime) {
    }

    private final AiFileRepository files;
    private final AiFileObjects objects;
    private final AiImagePrep prep;
    private final CurrentActor actor;
    private final Clock clock;

    public AiFiles(AiFileRepository files, AiFileObjects objects, AiImagePrep prep, CurrentActor actor, Clock clock) {
        this.files = files;
        this.objects = objects;
        this.prep = prep;
        this.actor = actor;
        this.clock = clock;
    }

    /** Stores one uploaded file; a PDF gives one picture per page. All or nothing: a failure removes what was stored. */
    public List<FileDto> upload(String name, byte[] content) {
        long adminId = actor.userId();
        List<AiImagePrep.Image> images = prep.prepare(content);
        int waiting = files.findByAdminIdAndJobIdIsNullOrderByIdAsc(adminId).size();
        if (waiting + images.size() > MAX_IMAGES) {
            throw new DomainException.BadRequest(AiError.FILES_LIMIT, MAX_IMAGES);
        }
        String uploadId = UUID.randomUUID().toString();
        String label = clean(name);
        List<AiFile> saved = new ArrayList<>();
        try {
            for (AiImagePrep.Image img : images) {
                String key = "u" + adminId + "/" + uploadId + "-" + (img.page() == null ? 1 : img.page())
                        + ("image/jpeg".equals(img.mime()) ? ".jpg" : ".png");
                objects.put(key, img.bytes(), img.mime());
                String shown = img.page() == null ? label : label + " (стр. " + img.page() + ")";
                saved.add(files.save(AiFile.of(adminId, uploadId, shown, key, img.mime(), img.bytes().length,
                        img.page(), clock.instant())));
            }
        } catch (RuntimeException e) {
            saved.forEach(f -> objects.removeQuietly(f.getObjectKey()));
            files.deleteAll(saved);
            throw e;
        }
        return saved.stream().map(FileDto::of).toList();
    }

    /** The admin's own pictures that no task has taken yet (a reopened screen shows them again). */
    @Transactional(readOnly = true)
    public List<FileDto> waiting() {
        return files.findByAdminIdAndJobIdIsNullOrderByIdAsc(actor.userId()).stream().map(FileDto::of).toList();
    }

    /** Removes a picture, and the whole upload it came from when it is a PDF page: a half of an invoice is worse than none. */
    @Transactional
    public void delete(long id) {
        AiFile f = own(id);
        List<AiFile> gone = List.of(f);
        if (!f.attached()) {
            gone = files.findByAdminIdAndJobIdIsNullOrderByIdAsc(f.getAdminId()).stream()
                    .filter(x -> x.getUploadId().equals(f.getUploadId())).toList();
        }
        gone.forEach(x -> objects.removeQuietly(x.getObjectKey()));
        files.deleteAll(gone);
    }

    @Transactional(readOnly = true)
    public Content content(long id) {
        AiFile f = own(id);
        byte[] bytes = objects.get(f.getObjectKey());
        if (bytes == null) {
            throw new DomainException.NotFound(AiError.FILES_GONE);
        }
        return new Content(bytes, f.getMime());
    }

    /**
     * Gives the pictures to a task (in the transaction that creates it, so no worker can take the task before they are
     * its own). Refuses a missing, foreign, expired or already used picture and an empty or too long list.
     */
    @Transactional
    public int attach(Collection<Long> ids, long jobId) {
        long adminId = actor.userId();
        Set<Long> wanted = new HashSet<>(ids == null ? List.of() : ids);
        if (wanted.isEmpty() || wanted.size() > MAX_IMAGES) {
            throw new DomainException.BadRequest(AiError.FILES_LIMIT, MAX_IMAGES);
        }
        List<AiFile> found = files.findByIdIn(wanted);
        Instant now = clock.instant();
        if (found.size() != wanted.size() || found.stream().anyMatch(f -> f.getAdminId() != adminId || f.attached())) {
            throw new DomainException.NotFound(AiError.FILE_NOT_FOUND);
        }
        if (found.stream().anyMatch(f -> f.getExpiresAt().isBefore(now))) {
            throw new DomainException.Conflict(AiError.FILES_GONE);
        }
        found.forEach(f -> f.attachTo(jobId));
        return found.size();
    }

    /** The pictures a task reads; a retry reads those of the task it repeats. Empty once they were deleted. */
    @Transactional(readOnly = true)
    public List<ImagePart> imagesOf(AiJob job, LongFunction<AiJob> byId) {
        AiJob at = job;
        for (int hop = 0; hop < 4 && at != null; hop++) {
            List<AiFile> own = files.findByJobIdOrderByIdAsc(at.getId());
            if (!own.isEmpty()) {
                return own.stream().map(this::image).filter(Objects::nonNull).toList();
            }
            at = at.getRetryOf() == null ? null : byId.apply(at.getRetryOf());
        }
        return List.of();
    }

    private ImagePart image(AiFile f) {
        byte[] bytes = objects.get(f.getObjectKey());
        return bytes == null ? null : new ImagePart(f.getMime(), bytes);
    }

    /** Deletes the rows and objects past their time; returns how many. Called by the nightly job, repeated until none are left. */
    @Transactional
    public int purgeExpired() {
        int total = 0;
        List<AiFile> old;
        do {
            old = files.expired(clock.instant(), PageRequest.of(0, CLEAN_BATCH));
            old.forEach(f -> objects.removeQuietly(f.getObjectKey()));
            files.deleteAll(old);
            total += old.size();
        } while (old.size() == CLEAN_BATCH);
        return total;
    }

    private AiFile own(long id) {
        AiFile f = files.findById(id).orElseThrow(() -> new DomainException.NotFound(AiError.FILE_NOT_FOUND));
        if (f.getAdminId() != actor.userId()) {
            throw new DomainException.NotFound(AiError.FILE_NOT_FOUND);
        }
        return f;
    }

    private static String clean(String name) {
        String base = name == null ? "" : name.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").trim();
        return base.isEmpty() ? "файл" : base;
    }
}
