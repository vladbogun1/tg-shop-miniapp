package com.maxsolch.shop.journal.infra;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * What the journal module reads of {@code app.*}: retention of the "Bot and site" journal.
 * Binds a part of the {@code app.*} tree; keys and environment names are the same as before the split. Other
 * modules bind their own part of the same tree.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class JournalProperties {

    private Journal journal = new Journal();

    @Getter
    @Setter
    public static class Journal {
        private int retentionDays = 90;
        private int moneyRetentionDays = 1095;
    }
}
