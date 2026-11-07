package com.maxsolch.shop.ai.domain;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A web page reduced to what the model needs: title, main picture (og:image) and the text, cut to a few thousand
 * characters so that the spec table survives. Shop pages are mostly menus and links: lines are de-duplicated, image
 * and link markup is dropped, and the window starts at the first line that looks like specifications.
 */
public final class PageText {

    public static final int LIMIT = 9000;

    private static final Pattern DROP_BLOCKS = Pattern.compile(
            "(?is)<(script|style|noscript|svg|nav|footer|header|form|iframe)\\b[^>]*>.*?</\\1>");
    private static final Pattern BREAKS = Pattern.compile("(?i)<(br|/p|/div|/li|/tr|/h\\d|/td|/th)\\b[^>]*>");
    private static final Pattern TAGS = Pattern.compile("<[^>]+>");
    private static final Pattern TITLE = Pattern.compile("(?is)<title[^>]*>(.*?)</title>");
    private static final Pattern OG_1 = Pattern.compile(
            "(?i)<meta[^>]+property=[\"']og:image[\"'][^>]+content=[\"']([^\"']+)");
    private static final Pattern OG_2 = Pattern.compile(
            "(?i)<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']og:image");
    private static final Pattern MD_IMAGE = Pattern.compile("!\\[[^\\]]*]\\([^)]*\\)");
    private static final Pattern MD_LINK = Pattern.compile("\\[([^\\]]*)]\\([^)]*\\)");
    private static final Pattern SPEC_WORDS = Pattern.compile(
            "(?iu)(specification|specs|technical|характеристик|параметр|weight|вес|вага|dimensions|sensor|switch"
                    + "|frequency|impedance|polling|material)");

    public record WebPage(String title, String ogImage, String text) {

        /** What the model reads from the tool «open_page». */
        public String forModel() {
            return "Заголовок: " + title + "\nog:image: " + (ogImage == null ? "нет" : ogImage) + "\n\n" + compact(text, LIMIT);
        }
    }

    private PageText() {
    }

    public static WebPage fromHtml(String html) {
        String title = decode(first(TITLE, html, "")).trim();
        String og = first(OG_1, html, null);
        if (og == null) {
            og = first(OG_2, html, null);
        }
        String text = DROP_BLOCKS.matcher(html).replaceAll(" ");
        text = BREAKS.matcher(text).replaceAll("\n");
        text = decode(TAGS.matcher(text).replaceAll(" "));
        text = text.replaceAll("[ \\t\\x0B\\f\\r]+", " ").replaceAll("\\n\\s*\\n+", "\n").trim();
        return new WebPage(title, og == null ? null : decode(og), text);
    }

    /** The answer of the r.jina.ai reader: a {@code Title:} line, then markdown after {@code Markdown Content:}. */
    public static WebPage fromReader(String body) {
        Matcher t = Pattern.compile("(?m)^Title: (.*)$").matcher(body);
        String title = t.find() ? t.group(1).trim() : "";
        Matcher img = Pattern.compile("(?i)!\\[[^\\]]*]\\((https:[^)\\s]+\\.(?:jpg|jpeg|png|webp)[^)\\s]*)\\)").matcher(body);
        String og = img.find() ? img.group(1) : null;
        int at = body.indexOf("Markdown Content:");
        String text = at >= 0 ? body.substring(at + "Markdown Content:".length()) : body;
        return new WebPage(title, og, text.trim());
    }

    /** De-duplicated lines, markup dropped; when too long — the head plus the window from the first spec line. */
    public static String compact(String text, int limit) {
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : text.split("\n")) {
            String l = MD_LINK.matcher(MD_IMAGE.matcher(raw).replaceAll("")).replaceAll("$1").trim();
            if (l.length() >= 3) {
                seen.add(l);
            }
        }
        List<String> lines = new ArrayList<>(seen);
        String all = String.join("\n", lines);
        if (all.length() <= limit) {
            return all;
        }
        int at = -1;
        for (int i = 6; i < lines.size(); i++) {
            if (SPEC_WORDS.matcher(lines.get(i)).find()) {
                at = i;
                break;
            }
        }
        String head = String.join("\n", lines.subList(0, at > 0 ? Math.min(at, 40) : Math.min(40, lines.size())));
        head = head.substring(0, Math.min(head.length(), limit / 6));
        String tail = at > 0 ? String.join("\n", lines.subList(at, lines.size())) : all.substring(head.length());
        String out = head + "\n…\n" + tail;
        return out.substring(0, Math.min(out.length(), limit));
    }

    private static String first(Pattern p, String s, String fallback) {
        Matcher m = p.matcher(s);
        return m.find() ? m.group(1) : fallback;
    }

    private static String decode(String s) {
        Matcher m = Pattern.compile("&#(\\d+);").matcher(s.replace("&nbsp;", " ").replace("&quot;", "\"")
                .replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&"));
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            int code = Integer.parseInt(m.group(1).length() > 7 ? "32" : m.group(1));
            m.appendReplacement(sb, Matcher.quoteReplacement(new String(Character.toChars(
                    Character.isValidCodePoint(code) ? code : 32))));
        }
        m.appendTail(sb);
        return sb.toString();
    }
}
