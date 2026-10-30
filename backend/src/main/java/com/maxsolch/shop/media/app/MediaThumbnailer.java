package com.maxsolch.shop.media.app;

import com.maxsolch.shop.media.domain.Imgproxy;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.Set;

/**
 * Resized variants of private attachments, produced by the imgproxy that already sits in the stack
 * for product photos.
 *
 * <p>{@code /api/media} used to stream the stored original. A photo straight off a phone is
 * several megabytes, and the chat asked for that same file for a bubble barely 260px
 * wide — which is why photos took so long to appear, and sometimes appeared to not load at all.
 *
 * <p>imgproxy itself must stay out of reach for this bucket prefix: chat attachments are private
 * and the public {@code /img/insecure/...} path has no authorisation. So the request is made from
 * inside the compose network (the {@link Imgproxy} adapter), only after {@link MediaSigner} has accepted the
 * signature, and the bytes are streamed back through the API.
 */
@Component
public class MediaThumbnailer {

    /**
     * Sizes the apps may ask for. A closed set, so a valid link cannot be turned into an unbounded
     * "render this at 10 000 different sizes" CPU sink.
     */
    private static final Set<Integer> ALLOWED_WIDTHS = Set.of(320, 480, 960, 1600);

    private final Imgproxy imgproxy;

    public MediaThumbnailer(Imgproxy imgproxy) {
        this.imgproxy = imgproxy;
    }

    public static boolean isAllowedWidth(Integer width) {
        return width != null && ALLOWED_WIDTHS.contains(width);
    }

    /** A rendered variant, or null when imgproxy is unavailable and the caller should fall back. */
    public Variant render(String objectKey, int width) {
        Imgproxy.Rendered rendered = imgproxy.fit(objectKey, width);
        return rendered == null ? null : new Variant(rendered.stream(), rendered.contentType());
    }

    public record Variant(InputStream stream, String contentType) {
    }
}
