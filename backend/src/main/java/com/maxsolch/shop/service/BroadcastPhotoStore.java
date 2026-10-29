package com.maxsolch.shop.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Pictures attached to a broadcast, kept in memory only: the admin uploads one, gets an id, and
 * passes it to the test send / the broadcast. Nothing is written to disk or the database; a picture
 * lives for {@link #TTL} (a restart drops them all — the admin just uploads it again).
 */
@Component
public class BroadcastPhotoStore {

    /** What the admin uploaded: the bytes plus the type sniffed from them (not from the header). */
    public record Photo(byte[] bytes, String contentType, String filename) {
    }

    public static final int MAX_BYTES = 5 * 1024 * 1024;
    static final Duration TTL = Duration.ofHours(2);
    private static final int MAX_ENTRIES = 8;

    private record Entry(Photo photo, Instant at) {
    }

    private final Map<String, Entry> items = new LinkedHashMap<>();

    /** Validates (jpg/png/webp by magic bytes, up to 5 MB) and stores; returns the id. */
    public synchronized String put(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw bad("Файл пустой");
        }
        if (bytes.length > MAX_BYTES) {
            throw bad("Картинка больше 5 МБ");
        }
        String type = sniff(bytes);
        if (type == null) {
            throw bad("Подходят только JPG, PNG или WebP");
        }
        evict();
        String id = UUID.randomUUID().toString();
        items.put(id, new Entry(new Photo(bytes, type, "broadcast." + extension(type)), Instant.now()));
        return id;
    }

    public synchronized Optional<Photo> get(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        Entry e = items.get(id.trim());
        if (e == null || e.at().plus(TTL).isBefore(Instant.now())) {
            return Optional.empty();
        }
        return Optional.of(e.photo());
    }

    /** A blank id means "no picture" (null); a given id must still be alive. */
    public Photo require(String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        return get(id).orElseThrow(() -> bad("Картинка устарела — загрузите её заново"));
    }

    private void evict() {
        Instant limit = Instant.now().minus(TTL);
        items.values().removeIf(e -> e.at().isBefore(limit));
        Iterator<String> it = items.keySet().iterator();
        while (items.size() >= MAX_ENTRIES && it.hasNext()) {
            it.next();
            it.remove();
        }
    }

    static String sniff(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return "image/png";
        }
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return "image/webp";
        }
        return null;
    }

    private static String extension(String type) {
        return switch (type) {
            case "image/png" -> "png";
            case "image/webp" -> "webp";
            default -> "jpg";
        };
    }

    private static ResponseStatusException bad(String msg) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }
}
