package com.maxsolch.shop.ai.app;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The steps on their way to the database: no repeats, the tools not more often than once a second, turns always. */
class AiJobStepsTest {

    private final MovingClock clock = new MovingClock();
    private final List<String> written = new ArrayList<>();
    private final AiJobSteps steps = new AiJobSteps(written::add, clock);

    @Test
    void toolStepsInsideTheGapAreDroppedTurnsAreNot() {
        steps.step("Читаю задание", false);
        steps.step("Ищу: viper v3 pro specs", true);
        clock.advance(Duration.ofMillis(300));
        steps.step("Читаю страницу razer.com", true);
        steps.step("Разбираю найденное", false);
        clock.advance(AiJobSteps.GAP);
        steps.step("Читаю страницу rtings.com", true);

        assertThat(written).containsExactly("Читаю задание", "Ищу: viper v3 pro specs", "Разбираю найденное",
                "Читаю страницу rtings.com");
    }

    @Test
    void theSameTextIsWrittenOnceAndBlankNever() {
        steps.step("Пишу ответ", false);
        clock.advance(Duration.ofSeconds(5));
        steps.step("Пишу ответ", false);
        steps.step(" ", false);
        steps.step(null, true);

        assertThat(written).containsExactly("Пишу ответ");
    }

    @Test
    void aFailedWriteDoesNotStopTheRun() {
        List<String> tried = new ArrayList<>();
        AiJobSteps failing = new AiJobSteps(t -> {
            tried.add(t);
            throw new IllegalStateException("db down");
        }, clock);

        failing.step("Ищу: x", true);
        failing.step("Пишу ответ", false);

        assertThat(tried).containsExactly("Ищу: x", "Пишу ответ");
    }

    private static final class MovingClock extends Clock {
        private Instant now = Instant.parse("2026-11-07T10:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
