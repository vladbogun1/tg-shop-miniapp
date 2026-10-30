package com.maxsolch.shop.platform.jobs;

import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.context.annotation.Configuration;

/**
 * Background jobs run once across all backend instances.
 *
 * <p>Every {@code @Scheduled} method also carries {@code @SchedulerLock(name = "Class.method", ...)}: the lock is a
 * row of the {@code shedlock} table, taken with the database clock (instances may disagree on time).
 * {@code lockAtMostFor} must exceed the longest plausible run (if the instance dies, the lock frees itself after it);
 * {@code lockAtLeastFor} stops a second instance with a slightly different clock from repeating the same tick.
 * A job that fails does not keep the lock past {@code lockAtLeastFor}. The lock provider is
 * {@code platform.infra.LockProviderConfig}.
 */
@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "PT15M")
public class JobsConfig {
}
