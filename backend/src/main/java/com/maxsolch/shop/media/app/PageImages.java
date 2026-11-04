package com.maxsolch.shop.media.app;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The main picture of a product page, for when the AI gave the page instead of the picture: og:image, then
 * twitter:image, then the first "image" of JSON-LD. Regexes over the head are enough — these tags are flat and
 * machine-written; a full HTML parser would be a new dependency for three attributes.
 */
final class PageImages {

    private static final Pattern META = Pattern.compile("<meta\\s[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATTR = Pattern.compile("([a-zA-Z:-]+)\\s*=\\s*(\"([^\"]*)\"|'([^']*)')");
    private static final Pattern LD_IMAGE = Pattern.compile(
            "\"image\"\\s*:\\s*(?:\\[\\s*)?(?:\\{[^}]*?\"url\"\\s*:\\s*)?\"([^\"]+)\"");

    private PageImages() {
    }

    /** The picture's absolute URL, or null when the page names none. */
    static URI find(String html, URI page) {
        if (html == null) {
            return null;
        }
        String og = null;
        String twitter = null;
        Matcher m = META.matcher(html);
        while (m.find()) {
            String key = null;
            String content = null;
            Matcher a = ATTR.matcher(m.group());
            while (a.find()) {
                String name = a.group(1).toLowerCase(java.util.Locale.ROOT);
                String value = a.group(3) != null ? a.group(3) : a.group(4);
                if (name.equals("property") || name.equals("name")) {
                    key = value.toLowerCase(java.util.Locale.ROOT);
                } else if (name.equals("content")) {
                    content = value;
                }
            }
            if (content == null || key == null) {
                continue;
            }
            if (og == null && (key.equals("og:image") || key.equals("og:image:secure_url") || key.equals("og:image:url"))) {
                og = content;
            } else if (twitter == null && key.equals("twitter:image")) {
                twitter = content;
            }
        }
        String found = og != null ? og : twitter;
        if (found == null) {
            Matcher ld = LD_IMAGE.matcher(html);
            found = ld.find() ? ld.group(1).replace("\\/", "/") : null;
        }
        return found == null ? null : absolute(page, unescape(found));
    }

    private static URI absolute(URI page, String link) {
        try {
            String fixed = link.startsWith("//") ? page.getScheme() + ":" + link : link;
            return page.resolve(fixed.trim().replace(" ", "%20"));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String unescape(String s) {
        return s.replace("&amp;", "&").replace("&#x2F;", "/").replace("&#47;", "/").replace("&quot;", "\"");
    }
}
