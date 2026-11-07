package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiUsage;
import com.maxsolch.shop.ai.domain.PageText;
import com.maxsolch.shop.ai.domain.ReaderProxy;
import com.maxsolch.shop.media.app.RemotePages;
import com.maxsolch.shop.media.domain.MediaError;
import com.maxsolch.shop.media.domain.RemoteImages;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The tool «open_page»: the page as text for the model. First our own download (guarded against internal addresses,
 * see {@link RemotePages}); when the shop refuses us (403, 429, Cloudflare), the page is a JavaScript shell or the
 * download fails — the outside reader {@link ReaderProxy}. An address refused as internal is never handed to the
 * reader. Every opening is a PAGE line in {@code ai_usage} (provider {@code direct} or {@code reader}).
 */
@Service
public class WebPages {

    /** A page shorter than this after cleaning is a JS shell or an error page: worth asking the reader. */
    static final int MIN_TEXT = 500;
    private static final long MAX_BYTES = 3L * 1024 * 1024;
    private static final Pattern CHARSET = Pattern.compile("(?i)charset=\"?([\\w-]+)");

    private final RemotePages pages;
    private final ReaderProxy reader;
    private final AiUsageLog usage;
    private final Clock clock;

    public WebPages(RemotePages pages, ReaderProxy reader, AiUsageLog usage, Clock clock) {
        this.pages = pages;
        this.reader = reader;
        this.usage = usage;
        this.clock = clock;
    }

    /** What the model reads: the page, or one line saying why there is none (the model then tries another link). */
    public String open(String feature, String url) {
        URI uri;
        try {
            uri = URI.create(url.trim());
        } catch (IllegalArgumentException e) {
            return "Некорректная ссылка.";
        }
        if (WebSearch.skipped(url)) {
            return "Эту страницу открывать нельзя — возьми другой источник.";
        }
        long t0 = clock.millis();
        String why;
        try {
            PageText.WebPage page = direct(uri);
            if (page.text().length() >= MIN_TEXT) {
                usage.call(feature, AiUsage.Kind.PAGE, "direct", AiUsage.Result.OK, 0, clock.millis() - t0, null);
                return page.forModel();
            }
            why = "short " + page.text().length();
        } catch (DomainException e) {
            if (e.errorCode() == MediaError.IMAGE_URL_BLOCKED || e.errorCode() == MediaError.IMAGE_URL_BAD) {
                usage.call(feature, AiUsage.Kind.PAGE, "direct", AiUsage.Result.FAILED, 0, clock.millis() - t0,
                        e.errorCode().toString());
                return "Эту ссылку открыть нельзя: адрес недопустим.";
            }
            why = e.errorCode() + " " + java.util.Arrays.toString(e.args());
        }
        usage.call(feature, AiUsage.Kind.PAGE, "direct", AiUsage.Result.FAILED, 0, clock.millis() - t0, why);
        if (why.contains("HTTP 404") || why.contains("HTTP 410")) {
            return "Страницы нет (404). Не угадывай адреса — открывай ссылки из результатов поиска.";
        }
        return viaReader(feature, url, why);
    }

    private String viaReader(String feature, String url, String directFailure) {
        if (!reader.enabled()) {
            return "Страница не открылась (" + directFailure + "). Попробуй другую ссылку.";
        }
        long t0 = clock.millis();
        PageText.WebPage page = reader.read(url);
        boolean ok = page != null && page.text().length() >= MIN_TEXT / 5;
        usage.call(feature, AiUsage.Kind.PAGE, "reader", ok ? AiUsage.Result.OK : AiUsage.Result.FAILED, 0,
                clock.millis() - t0, ok ? null : "reader gave nothing");
        return ok ? page.forModel() : "Страница не открылась. Попробуй другую ссылку.";
    }

    private PageText.WebPage direct(URI uri) {
        RemoteImages.Fetched got = pages.fetch(uri, MAX_BYTES);
        return PageText.fromHtml(new String(got.bytes(), charset(got.contentType())));
    }

    static Charset charset(String contentType) {
        if (contentType != null) {
            Matcher m = CHARSET.matcher(contentType);
            if (m.find()) {
                try {
                    return Charset.forName(m.group(1).toLowerCase(Locale.ROOT));
                } catch (RuntimeException e) {
                    return StandardCharsets.UTF_8;
                }
            }
        }
        return StandardCharsets.UTF_8;
    }
}
