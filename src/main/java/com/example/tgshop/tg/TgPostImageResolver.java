package com.example.tgshop.tg;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@Slf4j
public class TgPostImageResolver {

    private static final Pattern CSS_URL = Pattern.compile("url\\((['\"]?)(.*?)\\1\\)");
    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    public List<String> resolveImages(List<String> urls) {
        return resolvePostImages(urls);
    }

    public List<String> resolvePostImages(List<String> urls) {
        if (urls == null || urls.isEmpty()) return List.of();

        log.info("🖼️ TG Resolving image urls count={}", urls.size());
        LinkedHashSet<String> out = new LinkedHashSet<>();

        for (String raw : urls) {
            if (raw == null) continue;
            String u = raw.trim();
            if (u.isBlank()) continue;

            if (looksLikeDirectImage(u)) {
                out.add(normalizeUrl(u));
                continue;
            }

            Optional<PostRef> ref = parsePostRef(u);
            if (ref.isPresent()) {
                PostRef pr = ref.get();
                log.debug("🖼️ TG Resolving telegram post images channel={} postId={}", pr.channel(), pr.postId());
                List<String> imgs = resolvePostImages(pr.channel(), pr.postId());
                out.addAll(imgs);
            }
        }

        log.debug("🖼️ TG Resolved {} unique image urls", out.size());
        return new ArrayList<>(out);
    }

    public List<String> resolvePostImages(String channel, long postId) {
        String dataPost = channel + "/" + postId;
        String url = "https://t.me/s/" + channel + "/" + postId + "?single";

        log.debug("🖼️ TG Fetching telegram post images url={}", url);
        Document doc = fetch(url);

        Element post = doc.selectFirst("div.tgme_widget_message[data-post=\"" + dataPost + "\"]");
        if (post == null) {
            post = doc.selectFirst("[data-post=\"" + dataPost + "\"]");
        }
        if (post == null) return List.of();

        Elements photoWraps = post.select("a.tgme_widget_message_photo_wrap, div.tgme_widget_message_photo_wrap");

        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (Element el : photoWraps) {
            String style = el.attr("style");
            String imgUrl = extractCssUrl(style);

            if (imgUrl == null || imgUrl.isBlank()) {
                Element img = el.selectFirst("img");
                if (img != null) imgUrl = img.attr("src");
            }

            imgUrl = normalizeUrl(imgUrl);

            if (looksLikeDirectImage(imgUrl)) {
                result.add(imgUrl);
            }
        }

        log.debug("🖼️ TG Resolved {} images for channel={} postId={}", result.size(), channel, postId);
        return new ArrayList<>(result);
    }

    // -------------------- helpers --------------------

    private Document fetch(String url) {
        try {
            return Jsoup.connect(url)
                    .userAgent(UA)
                    .referrer("https://t.me/")
                    .timeout(20_000)
                    .get();
        } catch (Exception e) {
            log.error("🖼️ TG Failed to fetch telegram post url={}", url, e);
            throw new RuntimeException("Failed to fetch: " + url, e);
        }
    }

    private String extractCssUrl(String style) {
        if (style == null || style.isBlank()) return null;
        Matcher m = CSS_URL.matcher(style);
        if (m.find()) return m.group(2);
        return null;
    }

    private String normalizeUrl(String url) {
        if (url == null) return null;
        url = url.trim();
        if (url.startsWith("//")) url = "https:" + url;
        return url;
    }

    private boolean looksLikeDirectImage(String url) {
        if (url == null || url.isBlank()) return false;
        String u = url.toLowerCase(Locale.ROOT);
        return u.startsWith("http://") || u.startsWith("https://") || u.startsWith("//")
                ? (u.contains("telesco.pe/file/") ||
                u.endsWith(".jpg") || u.endsWith(".jpeg") || u.endsWith(".png") ||
                u.endsWith(".webp") || u.endsWith(".gif"))
                : false;
    }

    private Optional<PostRef> parsePostRef(String rawUrl) {
        try {
            URI uri = URI.create(rawUrl.trim());

            // tg://resolve?domain=ChiSetup&post=1041
            if ("tg".equalsIgnoreCase(uri.getScheme())) {
                Map<String, String> q = parseQuery(uri.getRawQuery());
                String domain = q.get("domain");
                String post = q.get("post");
                if (domain != null && post != null && post.matches("\\d+")) {
                    return Optional.of(new PostRef(domain, Long.parseLong(post)));
                }
                return Optional.empty();
            }

            String host = uri.getHost();
            if (host == null) return Optional.empty();

            String h = host.toLowerCase(Locale.ROOT);
            if (!(h.endsWith("t.me") || h.endsWith("telegram.me") || h.endsWith("telegram.dog"))) {
                return Optional.empty();
            }

            String path = Optional.ofNullable(uri.getPath()).orElse("");
            String[] parts = path.replaceFirst("^/+", "").split("/");

            // /s/<channel>/<id>
            if (parts.length >= 3 && "s".equals(parts[0]) && parts[2].matches("\\d+")) {
                return Optional.of(new PostRef(parts[1], Long.parseLong(parts[2])));
            }

            // /<channel>/<id>
            if (parts.length >= 2 && parts[1].matches("\\d+")) {
                return Optional.of(new PostRef(parts[0], Long.parseLong(parts[1])));
            }

            // /<channel>?post=1041 (на всякий случай)
            Map<String, String> q = parseQuery(uri.getRawQuery());
            if (parts.length >= 1 && q.containsKey("post") && q.get("post").matches("\\d+")) {
                return Optional.of(new PostRef(parts[0], Long.parseLong(q.get("post"))));
            }

            return Optional.empty();
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    private Map<String, String> parseQuery(String rawQuery) {
        if (rawQuery == null || rawQuery.isBlank()) return Map.of();
        Map<String, String> map = new HashMap<>();
        for (String pair : rawQuery.split("&")) {
            int idx = pair.indexOf('=');
            if (idx <= 0) continue;
            String k = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
            String v = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
            map.put(k, v);
        }
        return map;
    }

    private record PostRef(String channel, long postId) {}
}
