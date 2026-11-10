package com.maxsolch.shop.translation.infra;

import java.util.regex.Pattern;

/**
 * XML mode of DeepL for texts with placeholders: the text is escaped, every {@code {name}} goes inside an ignored
 * {@code <x>} tag; the answer is turned back into plain text.
 */
final class DeepLMarkup {

    static final String TAG = "x";
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{[a-zA-Z0-9]+}");
    private static final Pattern TAGS = Pattern.compile("</?x>");

    private DeepLMarkup() {
    }

    static boolean needsXml(String text) {
        return PLACEHOLDER.matcher(text).find();
    }

    static String toXml(String text) {
        String escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        return PLACEHOLDER.matcher(escaped).replaceAll(m -> "<x>" + m.group() + "</x>");
    }

    static String fromXml(String xml) {
        return TAGS.matcher(xml).replaceAll("").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
    }
}
