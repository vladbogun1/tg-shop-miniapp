package com.maxsolch.shop.journal.domain;

import java.util.regex.Pattern;

import static com.maxsolch.shop.platform.util.Texts.ellipsize;

/** Text clean-up for the journal: no secrets and no markup in what is stored. */
public final class JournalText {

    /** {@code bot123456:AA...} — a bot token inside an exception text (URLs of the Bot API). */
    private static final Pattern BOT_TOKEN = Pattern.compile("bot\\d{5,}:[A-Za-z0-9_-]{20,}");
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]{1,200}>");

    private JournalText() {
    }

    /** Hides a bot token in an error text and trims it. */
    public static String sanitize(String s) {
        if (s == null) {
            return null;
        }
        return ellipsize(BOT_TOKEN.matcher(s).replaceAll("bot***"), 500);
    }

    /** HTML message → one line of plain text for the preview. */
    public static String plain(String html) {
        if (html == null) {
            return null;
        }
        String s = HTML_TAG.matcher(html).replaceAll(" ")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&amp;", "&");
        s = s.replaceAll("\\s+", " ").trim();
        return s.isEmpty() ? null : ellipsize(s, 500);
    }
}
