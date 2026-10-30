package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.infra.WebLoginTokenRepository;
import com.maxsolch.shop.customer.infra.WebSessionRepository;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/** Hourly: login requests a day past expiry, sessions expired or revoked over 30 days ago. */
@Slf4j
@Component
public class WebSessionCleanupJob {

    private final WebLoginTokenRepository tokenRepository;
    private final WebSessionRepository sessionRepository;
    private final Clock clock;

    public WebSessionCleanupJob(WebLoginTokenRepository tokenRepository, WebSessionRepository sessionRepository,
                                Clock clock) {
        this.tokenRepository = tokenRepository;
        this.sessionRepository = sessionRepository;
        this.clock = clock;
    }

    @SchedulerLock(name = "WebAuthService.cleanup", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Scheduled(cron = "${app.site.cleanup-cron:0 7 * * * *}")
    @Transactional
    public void cleanup() {
        Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        int tokens = tokenRepository.deleteExpiredBefore(now.minus(Duration.ofDays(1)));
        int sessions = sessionRepository.deleteStale(now, now.minus(Duration.ofDays(30)));
        if (tokens + sessions > 0) {
            log.info("Web auth cleanup: {} login requests, {} sessions removed", tokens, sessions);
        }
    }
}
