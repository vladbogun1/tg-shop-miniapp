package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.TreeSet;

/**
 * «Прочитать с ИИ» in the supply: one task that reads the uploaded pictures of an invoice or of order screenshots.
 * The screen builds the prompt (the same one the manual path copies, so one text serves both); the rules are fixed
 * here: low effort, no web research, at most {@link AiFiles#MAX_IMAGES} pictures, each used by one task. The pictures
 * are handed to the task in the transaction that creates it — a worker can never take the task before they are its own.
 * The object of the task is the set of its pictures, so a second press on the same set meets «already running».
 * Everything else (limits, switches, key, estimate) is {@link AiJobs#create}.
 */
@Service
public class AiSupplyJobs {

    public static final String SUBJECT = "SUPPLY_FILES";
    static final String EFFORT = "low";

    /** The pictures (ids from {@code POST /ai/files}) and the prompt the screen built for them. */
    public record Start(List<Long> fileIds, String prompt, String promptVersion) {
    }

    private final AiJobs jobs;
    private final AiJobReads reads;
    private final AiFiles files;
    private final CurrentActor actor;

    public AiSupplyJobs(AiJobs jobs, AiJobReads reads, AiFiles files, CurrentActor actor) {
        this.jobs = jobs;
        this.reads = reads;
        this.files = files;
        this.actor = actor;
    }

    @Transactional
    public AiJobDto start(Start req, String idemKey) {
        if (req == null || req.fileIds() == null || req.fileIds().isEmpty() || req.fileIds().size() > AiFiles.MAX_IMAGES) {
            throw new DomainException.BadRequest(AiError.FILES_LIMIT, AiFiles.MAX_IMAGES);
        }
        if (idemKey != null && !idemKey.isBlank()) {
            // a repeated press answers with the first task; its pictures are already its own
            var same = reads.byKey(actor.userId(), idemKey, true);
            if (same.isPresent()) {
                return same.get();
            }
        }
        AiJobDto job = jobs.create(new AiJobs.CreateJob(AiFeature.SUPPLY_EXTRACT, SUBJECT, subjectOf(req.fileIds()), null,
                JobMode.NORMAL, EFFORT, req.fileIds().size(), req.prompt(), req.promptVersion()), idemKey);
        files.attach(req.fileIds(), job.id());
        return job;
    }

    private static String subjectOf(List<Long> ids) {
        try {
            byte[] sum = MessageDigest.getInstance("SHA-256").digest(new TreeSet<>(ids).toString().getBytes(StandardCharsets.UTF_8));
            return "f" + HexFormat.of().formatHex(sum).substring(0, 20);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
