package com.maxsolch.shop.platform.jobs;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Background jobs run once across all backend instances.
 *
 * <p>Every {@code @Scheduled} method also carries {@code @SchedulerLock(name = "Class.method", ...)}: the lock is a
 * row of the {@code shedlock} table, taken with the database clock (instances may disagree on time).
 * {@code lockAtMostFor} must exceed the longest plausible run (if the instance dies, the lock frees itself after it);
 * {@code lockAtLeastFor} stops a second instance with a slightly different clock from repeating the same tick.
 * A job that fails does not keep the lock past {@code lockAtLeastFor}.
 */
@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "PT15M")
public class JobsConfig {

    @Bean
    public LockProvider lockProvider(JdbcTemplate jdbcTemplate) {
        return new JdbcTemplateLockProvider(JdbcTemplateLockProvider.Configuration.builder()
                .withJdbcTemplate(jdbcTemplate)
                .usingDbTime()
                .build());
    }
}
