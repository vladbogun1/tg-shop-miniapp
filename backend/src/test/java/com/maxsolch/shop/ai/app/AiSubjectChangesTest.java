package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.FieldChange;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.JobTotals;
import com.maxsolch.shop.ai.domain.SubjectEditors;
import com.maxsolch.shop.ai.domain.SubjectFields;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The edit conflict decided on the server: the snapshot at the start against the card now, the people who edited it
 * after the start (by name, newest first), nothing when there is nothing to protect.
 */
class AiSubjectChangesTest {

    private static final Instant START = Instant.parse("2026-11-07T12:00:00.250Z");
    private static final Instant EDIT = Instant.parse("2026-11-07T12:20:00Z");

    private final Map<String, Map<String, String>> cards = new HashMap<>();
    private Instant askedSince;
    private final SubjectEditors editors = new SubjectEditors() {
        @Override
        public String subjectType() {
            return "PRODUCT";
        }

        @Override
        public List<Edit> since(String subjectId, Instant since) {
            askedSince = since;
            return List.of(new Edit("Иван", EDIT));
        }
    };
    private final AiSubjectChanges changes = new AiSubjectChanges(new AiSubjects(List.of(new Cards())),
            List.of(editors), new ObjectMapper());

    @Test
    void aFieldChangedAfterTheStartIsReportedWithWhoEditedTheCard() {
        cards.put("p1", Map.of("spec:weight", "60", "title", "Viper"));
        String snapshot = changes.snapshot("PRODUCT", "p1");
        cards.put("p1", Map.of("spec:weight", "62", "title", "Viper"));

        AiJobDto.SubjectChanges out = changes.since(done("p1"), snapshot);

        assertThat(out.fields()).containsExactly(new AiJobDto.Change("spec:weight", "60", "62"));
        assertThat(out.editors()).containsExactly(new AiJobDto.Editor("Иван", EDIT));
        // the audit keeps whole seconds: an edit in the second of the start counts
        assertThat(askedSince).isEqualTo(Instant.parse("2026-11-07T12:00:00Z"));
    }

    @Test
    void anUntouchedCardHasNoChangesAndNobodyIsAsked() {
        cards.put("p1", Map.of("spec:weight", "60"));
        String snapshot = changes.snapshot("PRODUCT", "p1");

        AiJobDto.SubjectChanges out = changes.since(done("p1"), snapshot);

        assertThat(out.fields()).isEmpty();
        assertThat(out.editors()).isEmpty();
        assertThat(askedSince).isNull();
    }

    @Test
    void nothingToProtectWithoutASnapshotAfterTheOutcomeOrForAnUnknownObject() {
        cards.put("p1", Map.of("spec:weight", "60"));
        String snapshot = changes.snapshot("PRODUCT", "p1");
        AiJob handled = done("p1");
        handled.recordOutcome(new AiJob.Outcome(1, 0, 0, 0), EDIT);

        assertThat(changes.since(done("p1"), null)).isNull();
        assertThat(changes.since(handled, snapshot)).isNull();
        assertThat(changes.snapshot("PRODUCT", "gone")).isNull();
        assertThat(changes.snapshot("TRANSLATION", "x")).isNull();
        assertThat(changes.since(done("gone"), snapshot)).isNull();
    }

    @Test
    void aJobWithoutAResultIsNotCompared() {
        cards.put("p1", Map.of("spec:weight", "60"));
        String snapshot = changes.snapshot("PRODUCT", "p1");
        AiJob running = queued("p1");
        running.claim("w", START, Duration.ofMinutes(5));

        assertThat(running.getStatus()).isEqualTo(JobStatus.RUNNING);
        assertThat(changes.since(running, snapshot)).isNull();
    }

    private static AiJob queued(String subject) {
        return AiJob.queued(new AiJob.Spec(AiFeature.COMPLETION, 7, "PRODUCT", subject, "v1", JobMode.NORMAL,
                "medium", 1, "card-v1", null, null), START);
    }

    private static AiJob done(String subject) {
        AiJob j = queued(subject);
        j.claim("w", START, Duration.ofMinutes(5));
        j.finish(JobStatus.DONE, JobTotals.NONE, START.plusSeconds(60));
        return j;
    }

    private final class Cards implements SubjectFields {
        @Override
        public String subjectType() {
            return "PRODUCT";
        }

        @Override
        public Map<String, String> snapshot(String subjectId) {
            return find(subjectId).orElseThrow();
        }

        @Override
        public Optional<Map<String, String>> find(String subjectId) {
            return Optional.ofNullable(cards.get(subjectId));
        }

        @Override
        public Reverted revertUnchanged(String subjectId, Map<String, FieldChange> c) {
            return new Reverted(List.of(), List.of());
        }
    }
}
