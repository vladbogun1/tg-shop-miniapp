package com.maxsolch.shop;

import com.maxsolch.shop.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Phase 1: the Telegram bot is not wired yet (no bot bean). Under Spring Boot 3.x the
 * telegrambots 6.9.7.1 starter does not auto-configure anything (its registration lives in the
 * legacy spring.factories EnableAutoConfiguration key, ignored by Boot 3), so no exclude is
 * needed — the context starts cleanly with no bot registered. The bot subsystem will wire
 * TelegramBotsApi + bot registration explicitly when it lands.
 */
@SpringBootApplication
@EnableCaching
@EnableScheduling
@EnableAsync
@EnableConfigurationProperties(AppProperties.class)
public class TgShopApplication {

    public static void main(String[] args) {
        SpringApplication.run(TgShopApplication.class, args);
    }
}
