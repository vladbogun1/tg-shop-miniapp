package com.maxsolch.shop.platform.infra;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Where the {@code shedlock} table is read and written: ShedLock's JDBC lock provider. The only technical storage of
 * the platform; the locks themselves are taken by {@code @SchedulerLock} (see {@code JobsConfig}).
 */
@Configuration
public class LockProviderConfig {

    @Bean
    public LockProvider lockProvider(JdbcTemplate jdbcTemplate) {
        return new JdbcTemplateLockProvider(JdbcTemplateLockProvider.Configuration.builder()
                .withJdbcTemplate(jdbcTemplate)
                .usingDbTime()
                .build());
    }
}
