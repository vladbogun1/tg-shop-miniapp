package com.maxsolch.shop.ai.app;

import lombok.extern.slf4j.Slf4j;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.function.Consumer;

/**
 * The steps of one run on their way to the database ({@code ai_jobs.step}): the same text twice is written once, and
 * the steps of the tools (several a turn) not more often than one in {@link #GAP} — the screen polls every couple of
 * seconds, a write per search would only load the database. A turn of the model is written always. A failed write
 * never stops the run: the step is a hint for the screen, the job goes on without it.
 */
@Slf4j
final class AiJobSteps implements AiAgent.Progress {

    static final Duration GAP = Duration.ofSeconds(1);

    private final Consumer<String> sink;
    private final Clock clock;
    private String last;
    /** When the last step of a tool was written: the gap is counted between the steps of the tools only. */
    private Instant lastToolAt;

    AiJobSteps(Consumer<String> sink, Clock clock) {
        this.sink = sink;
        this.clock = clock;
    }

    @Override
    public void step(String text, boolean frequent) {
        if (text == null || text.isBlank() || text.equals(last)) {
            return;
        }
        Instant now = clock.instant();
        if (frequent) {
            if (lastToolAt != null && now.isBefore(lastToolAt.plus(GAP))) {
                return;
            }
            lastToolAt = now;
        }
        last = text;
        try {
            sink.accept(text);
        } catch (RuntimeException e) {
            log.debug("ai step not written: {}", e.getMessage());
        }
    }
}
