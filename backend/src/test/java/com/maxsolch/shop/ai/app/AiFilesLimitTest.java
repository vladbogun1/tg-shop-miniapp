package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFile;
import com.maxsolch.shop.ai.domain.AiFileObjects;
import com.maxsolch.shop.ai.infra.AiFileRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * At most 10 pictures wait for one reading: an upload that would go over is refused before anything is stored, and the
 * error says how many already wait and how many the file gives (a PDF page is a picture); a task takes 1 to 10.
 */
class AiFilesLimitTest {

    private static final Instant T0 = Instant.parse("2026-11-07T10:00:00Z");

    private final AiFileRepository repo = mock(AiFileRepository.class);
    private final AiFileObjects objects = mock(AiFileObjects.class);
    private final AiImagePrep prep = mock(AiImagePrep.class);
    private final CurrentActor actor = mock(CurrentActor.class);
    private final AiFiles files = new AiFiles(repo, objects, prep, actor, Clock.fixed(T0, ZoneOffset.UTC));

    @BeforeEach
    void setUp() {
        when(actor.userId()).thenReturn(7L);
    }

    private void waiting(int n) {
        List<AiFile> list = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            list.add(AiFile.of(7L, "u", "f" + i, "k" + i, "image/jpeg", 10, null, T0));
        }
        when(repo.findByAdminIdAndJobIdIsNullOrderByIdAsc(7L)).thenReturn(list);
    }

    private void fileGives(int pictures) {
        List<AiImagePrep.Image> images = new ArrayList<>();
        for (int i = 1; i <= pictures; i++) {
            images.add(new AiImagePrep.Image(new byte[]{1}, "image/jpeg", 10, 10, pictures > 1 ? i : null));
        }
        when(prep.prepare(any())).thenReturn(images);
    }

    @Test
    void aPdfThatWouldTakeTheWaitingPicturesOverTenIsRefusedWithTheCounts() {
        waiting(8);
        fileGives(3);

        assertThatThrownBy(() -> files.upload("invoice.pdf", new byte[]{1})).isInstanceOfSatisfying(
                DomainException.BadRequest.class, e -> {
                    assertThat(e.errorCode()).isEqualTo(AiError.FILES_OVER);
                    assertThat(e.args()).containsExactly(AiFiles.MAX_IMAGES, 8, 3);
                });
        verify(objects, never()).put(anyString(), any(), anyString());
    }

    @Test
    void theTenthPictureIsStillTaken() {
        waiting(9);
        fileGives(1);
        when(repo.save(any())).thenAnswer(call -> {
            AiFile f = call.getArgument(0);
            ReflectionTestUtils.setField(f, "id", 31L);
            return f;
        });

        assertThat(files.upload("photo.jpg", new byte[]{1})).hasSize(1);
    }

    @Test
    void aTaskTakesOneToTenPictures() {
        assertThatThrownBy(() -> files.attach(List.of(), 5L))
                .isInstanceOfSatisfying(DomainException.BadRequest.class,
                        e -> assertThat(e.errorCode()).isEqualTo(AiError.FILES_LIMIT));
        List<Long> eleven = new ArrayList<>();
        for (long i = 1; i <= 11; i++) {
            eleven.add(i);
        }
        assertThatThrownBy(() -> files.attach(eleven, 5L)).isInstanceOfSatisfying(DomainException.BadRequest.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.FILES_LIMIT));
    }
}
