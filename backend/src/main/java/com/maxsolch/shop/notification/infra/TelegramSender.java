package com.maxsolch.shop.notification.infra;

import com.maxsolch.shop.notification.domain.TelegramGateway;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import org.apache.http.client.config.RequestConfig;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.DefaultAbsSender;
import org.telegram.telegrambots.bots.DefaultBotOptions;

import java.time.Duration;

/**
 * Sends to the Bot API with explicit deadlines (before: the library defaults, i.e. no read deadline at all, so a
 * hung connection held the calling thread, often inside a request or a scheduled job). Defaults: 5 s to connect,
 * 15 s per answer; override with {@code app.http.clients.telegram.connect-timeout / request-timeout}.
 * Retries: none (see {@link TelegramGateway}); {@code max-retries} is ignored on purpose.
 *
 * <p>Separate from the long-polling {@link ShopBot}, which only receives: a long poll legitimately waits tens of
 * seconds and needs its own, longer deadline.
 */
@Component
public class TelegramSender extends DefaultAbsSender implements TelegramGateway {

    static final HttpClientSettings DEFAULTS = HttpClientSettings.defaults("telegram")
            .withTimeouts(Duration.ofSeconds(5), Duration.ofSeconds(15));

    private final String token;

    public TelegramSender(AppProperties props, HttpClients httpClients) {
        super(options(httpClients.settings(DEFAULTS)));
        String t = props.getTelegram().getBotToken();
        this.token = t == null ? "" : t;
    }

    static DefaultBotOptions options(HttpClientSettings s) {
        DefaultBotOptions options = new DefaultBotOptions();
        options.setRequestConfig(RequestConfig.custom()
                .setConnectTimeout((int) s.connectTimeout().toMillis())
                .setConnectionRequestTimeout((int) s.connectTimeout().toMillis())
                .setSocketTimeout((int) s.requestTimeout().toMillis())
                .build());
        return options;
    }

    @Override
    public String getBotToken() {
        return token;
    }
}
