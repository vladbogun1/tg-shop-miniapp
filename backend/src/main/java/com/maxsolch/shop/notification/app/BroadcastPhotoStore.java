package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.notification.domain.NotificationError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Pictures attached to a broadcast, kept in memory only: the admin uploads one, gets an id, and
 * passes it to the test send / the broadcast. Nothing is written to disk or the database: the pictures sit in a
 * Spring cache ({@link #SPEC}: eight at most, each for two hours; a restart drops them all — the admin just
 * uploads it again).
 */
@Component
public class BroadcastPhotoStore {

    /** What the admin uploaded: the bytes plus the type sniffed from them (not from the header). */
    public record Photo(byte[] bytes, String contentType, String filename) {
    }

    public static final int MAX_BYTES = 5 * 1024 * 1024;
    static final CacheSpec SPEC = new CacheSpec("broadcastPhotos", 8, Duration.ofHours(2));

    private final Cache items;

    public BroadcastPhotoStore(CacheManager caches) {
        this.items = Objects.requireNonNull(caches.getCache(SPEC.name()), "cache " + SPEC.name());
    }

    @Bean
    CacheSpec broadcastPhotosSpec() {
        return SPEC;
    }

    /** Validates (jpg/png/webp by magic bytes, up to 5 MB) and stores; returns the id. */
    public String put(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new DomainException.BadRequest(NotificationError.BROADCAST_PHOTO_EMPTY);
        }
        if (bytes.length > MAX_BYTES) {
            throw new DomainException.BadRequest(NotificationError.BROADCAST_PHOTO_TOO_BIG);
        }
        String type = sniff(bytes);
        if (type == null) {
            throw new DomainException.BadRequest(NotificationError.BROADCAST_PHOTO_BAD_TYPE);
        }
        String id = UUID.randomUUID().toString();
        items.put(id, new Photo(bytes, type, "broadcast." + extension(type)));
        return id;
    }

    public Optional<Photo> get(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(items.get(id.trim(), Photo.class));
    }

    /** Whether the request names a picture at all (a blank id means text only). */
    public static boolean given(String id) {
        return id != null && !id.isBlank();
    }

    /** A blank id means "no picture" (null); a given id must still be alive. */
    public Photo require(String id) {
        if (!given(id)) {
            return null;
        }
        return get(id).orElseThrow(() -> new DomainException.BadRequest(NotificationError.BROADCAST_PHOTO_STALE));
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
}
