package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobPath;
import com.maxsolch.shop.ai.domain.ManualReason;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The server, not the screen, says why the manual way was used. */
class AiManualMarksTest {

    private static final Instant NOW = Instant.parse("2026-11-07T10:00:00Z");

    private final AiJobRepository jobs = mock(AiJobRepository.class);
    private final AiPolicy policy = mock(AiPolicy.class);
    private final AiLimits limits = mock(AiLimits.class);
    private final AiAgent agent = mock(AiAgent.class);
    private final CurrentActor actor = mock(CurrentActor.class);
    private final AiManualMarks marks = new AiManualMarks(jobs, policy, limits, agent, actor,
            Clock.fixed(NOW, ZoneOffset.UTC));

    private void aiIsOn() {
        when(agent.configured()).thenReturn(true);
        when(policy.enabled()).thenReturn(true);
        when(policy.featureOn(any())).thenReturn(true);
        when(limits.exhausted()).thenReturn(Optional.empty());
        when(jobs.findFirstBySubjectTypeAndSubjectIdAndPathOrderByIdDesc(any(), any(), any()))
                .thenReturn(Optional.empty());
    }

    @Test
    void whenTheAiWorksTheReasonIsTheAdminsChoice() {
        aiIsOn();
        assertThat(marks.reason(AiFeature.CARD, "p1", NOW)).isEqualTo(ManualReason.CHOICE);
    }

    @Test
    void aNotConfiguredOrSwitchedOffAiIsOff() {
        aiIsOn();
        when(agent.configured()).thenReturn(false);
        assertThat(marks.reason(AiFeature.CARD, "p1", NOW)).isEqualTo(ManualReason.OFF);
    }

    @Test
    void aUsedUpLimitIsLimit() {
        aiIsOn();
        when(limits.exhausted()).thenReturn(Optional.of(AiError.MONTH_LIMIT));
        assertThat(marks.reason(AiFeature.CARD, "p1", NOW)).isEqualTo(ManualReason.LIMIT);
    }

    @Test
    void oneRecordPerProductWithTheAdminAndTheManualPath() {
        aiIsOn();
        when(actor.userId()).thenReturn(7L);

        int n = marks.record(new AiManualMarks.Mark(AiFeature.CARD, List.of("a", "b")));

        assertThat(n).isEqualTo(2);
        ArgumentCaptor<AiJob> saved = ArgumentCaptor.forClass(AiJob.class);
        verify(jobs, times(2)).save(saved.capture());
        assertThat(saved.getAllValues()).allSatisfy(j -> {
            assertThat(j.getPath()).isEqualTo(JobPath.MANUAL);
            assertThat(j.getAdminId()).isEqualTo(7L);
        });
    }

    @Test
    void emptyOrHugeListsAreRefused() {
        assertThatThrownBy(() -> AiManualMarks.validate(new AiManualMarks.Mark(AiFeature.CARD, List.of())))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> AiManualMarks.validate(new AiManualMarks.Mark(AiFeature.SEARCH_TEST, List.of("a"))))
                .isInstanceOf(DomainException.BadRequest.class);
        List<String> many = java.util.stream.IntStream.range(0, 101).mapToObj(String::valueOf).toList();
        assertThatThrownBy(() -> AiManualMarks.validate(new AiManualMarks.Mark(AiFeature.CARD, many)))
                .isInstanceOf(DomainException.BadRequest.class);
    }
}
