package com.maxsolch.shop.notification.infra;

import com.maxsolch.shop.platform.http.HttpClientSettings;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/** Sending to Telegram has explicit deadlines (before the move: none), and they can be overridden by settings. */
class TelegramSenderTest {

    @Test
    void defaultsAreFiveSecondsToConnectAndFifteenPerAnswerWithoutRetries() {
        assertThat(TelegramSender.DEFAULTS.connectTimeout()).isEqualTo(Duration.ofSeconds(5));
        assertThat(TelegramSender.DEFAULTS.requestTimeout()).isEqualTo(Duration.ofSeconds(15));
        assertThat(TelegramSender.DEFAULTS.maxRetries()).isZero();
    }

    @Test
    void settingsBecomeTheRequestConfigOfTheLibraryClient() {
        var config = TelegramSender.options(TelegramSender.DEFAULTS
                .withTimeouts(Duration.ofSeconds(2), Duration.ofSeconds(7))).getRequestConfig();
        assertThat(config.getConnectTimeout()).isEqualTo(2000);
        assertThat(config.getSocketTimeout()).isEqualTo(7000);
    }
}
