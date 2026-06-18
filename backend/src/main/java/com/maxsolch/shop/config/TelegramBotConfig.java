package com.maxsolch.shop.config;

import com.maxsolch.shop.tg.ShopBot;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.meta.generics.BotSession;
import org.telegram.telegrambots.updatesreceivers.DefaultBotSession;

/**
 * Registers {@link ShopBot} with Telegram on startup, but only when a bot token is configured.
 * Under Spring Boot 3 the telegrambots starter does not auto-register the bot, so we do it here
 * explicitly. All failures are caught and logged so a bad/empty token can never crash the context.
 */
@Slf4j
@Configuration
public class TelegramBotConfig {

    private final AppProperties props;
    private final ShopBot shopBot;
    private BotSession session;

    public TelegramBotConfig(AppProperties props, ShopBot shopBot) {
        this.props = props;
        this.shopBot = shopBot;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void registerBot() {
        String token = props.getTelegram().getBotToken();
        if (token == null || token.isBlank()) {
            log.info("Telegram bot token is blank — bot not registered (notifications disabled).");
            return;
        }
        try {
            TelegramBotsApi api = new TelegramBotsApi(DefaultBotSession.class);
            session = api.registerBot(shopBot);
            log.info("Telegram bot registered as @{}", shopBot.getBotUsername());
        } catch (Exception e) {
            log.warn("Failed to register Telegram bot (continuing without it): {}", e.getMessage());
        }
    }
}
