package com.maxsolch.shop.it;

import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.time.ShopZone;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The platform beans exist in the real context and the ShedLock table (V75) works against MySQL. */
class PlatformWiringIT extends AbstractMysqlIT {

    @Autowired
    LockProvider lockProvider;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    Clock clock;
    @Autowired
    ShopZone shopZone;
    @Autowired
    AppProperties props;
    @Autowired
    com.maxsolch.shop.journal.infra.JournalProperties journalProps;
    @Autowired
    com.maxsolch.shop.media.infra.MediaProperties mediaProps;

    @Test
    void jobLockIsExclusiveUntilReleased() {
        String name = "it-" + UUID.randomUUID().toString().substring(0, 8);
        LockConfiguration cfg = new LockConfiguration(Instant.now(), name, Duration.ofMinutes(1), Duration.ZERO);

        Optional<SimpleLock> first = lockProvider.lock(cfg);
        assertThat(first).isPresent();
        assertThat(lockProvider.lock(cfg)).as("second instance must not get the same lock").isEmpty();

        first.get().unlock();
        Optional<SimpleLock> again = lockProvider.lock(cfg);
        assertThat(again).isPresent();
        again.get().unlock();
        assertThat(jdbc.queryForObject("select count(*) from shedlock where name = ?", Integer.class, name)).isEqualTo(1);
    }

    @Test
    void timeAndPropertiesBeansAreWired() {
        assertThat(clock).isNotNull();
        assertThat(shopZone.zone().getId()).isEqualTo(props.getTimezone());
        assertThat(journalProps.getJournal().getRetentionDays()).isEqualTo(90);
        assertThat(mediaProps.getMedia().getImgproxyUrl()).isNotBlank();
    }
}
