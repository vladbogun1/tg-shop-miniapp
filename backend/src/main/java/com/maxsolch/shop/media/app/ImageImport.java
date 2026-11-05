package com.maxsolch.shop.media.app;

import com.maxsolch.shop.media.domain.Cutout;
import com.maxsolch.shop.media.domain.Imgproxy;
import com.maxsolch.shop.media.domain.MediaError;
import com.maxsolch.shop.media.domain.ObjectStore;
import com.maxsolch.shop.media.domain.RemoteImages;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * A product photo from a link (the AI finds them while the product is not in hand yet), brought to the shop's one
 * format: a {@value #SIZE}×{@value #SIZE} WebP, the product cut out of its background and centred on the shop's
 * #1a1a1a with an even {@value #PADDING} px border, metadata stripped (owner, 2026-11-05).
 *
 * <p>When the cut-out finds nothing to cut (a photo without a background around the product) or is off, the photo is
 * squared as it is: margins trimmed, on the colour of its own edges.
 *
 * <p>The link may be the picture or the product page (then og:image / JSON-LD is taken). The original is kept in
 * storage only while imgproxy renders it (imgproxy reads {@code products/} only) and is deleted afterwards.
 */
@Service
public class ImageImport {

    static final int SIZE = 1600;
    static final int PADDING = 80;
    /** A smaller original would be enlarged into mush; product pages give 800–2000 px. */
    static final int MIN_SIDE = 500;
    static final long MAX_BYTES = 15L * 1024 * 1024;
    private static final String KINDS = "jpg, png, webp, gif, avif";
    /** The shop's photo background (product cards, the site's dark theme). */
    static final Imgproxy.Rgb DARK = new Imgproxy.Rgb(0x1a, 0x1a, 0x1a);

    /** The stored photo and where it was finally taken from (after redirects / the page's og:image). */
    public record Imported(String key, String source, boolean cutOut) {
    }

    private final RemoteImages remote;
    private final ObjectStore store;
    private final Imgproxy imgproxy;
    private final Cutout cutout;
    private final Supplier<UUID> ids;

    @Autowired
    public ImageImport(RemoteImages remote, ObjectStore store, Imgproxy imgproxy, Cutout cutout) {
        this(remote, store, imgproxy, cutout, UUID::randomUUID);
    }

    ImageImport(RemoteImages remote, ObjectStore store, Imgproxy imgproxy, Cutout cutout, Supplier<UUID> ids) {
        this.remote = remote;
        this.store = store;
        this.imgproxy = imgproxy;
        this.cutout = cutout;
        this.ids = ids;
    }

    /** Downloads, squares and stores the photo; throws a {@link DomainException.BadRequest} with a media code otherwise. */
    public Imported importFrom(String link) {
        URI asked = parse(link);
        RemoteImages.Fetched fetched = remote.fetch(asked, MAX_BYTES);
        ImageHeader header = ImageHeader.of(fetched.bytes());
        if (header == null && looksLikeHtml(fetched)) {
            URI picture = landedOnHome(asked, fetched.finalUrl()) ? null
                    : PageImages.find(new String(fetched.bytes(), StandardCharsets.UTF_8), fetched.finalUrl());
            if (picture == null) {
                throw new DomainException.BadRequest(MediaError.IMAGE_NOT_ON_PAGE);
            }
            fetched = remote.fetch(picture, MAX_BYTES);
            header = ImageHeader.of(fetched.bytes());
        }
        if (header == null) {
            throw new DomainException.BadRequest(MediaError.BAD_FILE_TYPE, KINDS);
        }
        if (header.sizeKnown() && Math.max(header.width(), header.height()) < MIN_SIDE) {
            throw new DomainException.BadRequest(MediaError.IMAGE_TOO_SMALL, MIN_SIDE);
        }
        UUID id = ids.get();
        byte[] cut = usable(cutout.cut(fetched.bytes(), header.contentType()));
        String source = cut != null ? "products/_import/" + id + "/cutout.png"
                : "products/_import/" + id + "/source." + header.extension();
        byte[] original = cut != null ? cut : fetched.bytes();
        store.put(source, new ByteArrayInputStream(original), original.length, cut != null ? "image/png" : header.contentType());
        try {
            byte[] square = cut != null ? squared(imgproxy.square(source, SIZE, PADDING, DARK, false)) : render(source);
            String key = "products/" + id + "/photo.webp";
            store.put(key, new ByteArrayInputStream(square), square.length, "image/webp");
            return new Imported(key, fetched.finalUrl().toString(), cut != null);
        } finally {
            store.removeQuietly(source);
        }
    }

    /**
     * The cut-out only when it is a real picture of at least {@link #MIN_SIDE} px: a small product in a big photo
     * would be enlarged into mush, and a 200 with a broken body must not fail the import. Null = square the original.
     */
    private static byte[] usable(byte[] cut) {
        if (cut == null || cut.length == 0) {
            return null;
        }
        ImageHeader h = ImageHeader.of(cut);
        if (h == null || (h.sizeKnown() && Math.max(h.width(), h.height()) < MIN_SIDE)) {
            return null;
        }
        return cut;
    }

    /** The photo as it is: margins trimmed, on the colour of its own edges. */
    private byte[] render(String source) {
        Imgproxy.Rgb background = EdgeColor.ofPng(bytes(imgproxy.preview(source, 64)));
        return squared(imgproxy.square(source, SIZE, PADDING, background, true));
    }

    private static byte[] squared(Imgproxy.Rendered rendered) {
        byte[] square = bytes(rendered);
        if (square == null || square.length == 0) {
            throw new DomainException.BadRequest(MediaError.IMAGE_PROCESSING_FAILED);
        }
        return square;
    }

    private static URI parse(String link) {
        if (link == null || link.isBlank() || link.length() > 2048) {
            throw new DomainException.BadRequest(MediaError.IMAGE_URL_BAD);
        }
        try {
            return new URI(link.trim().replace(" ", "%20"));
        } catch (java.net.URISyntaxException e) {
            throw new DomainException.BadRequest(MediaError.IMAGE_URL_BAD);
        }
    }

    /** A product link that ended on the site's root: the product is gone, and the root's og:image is the logo. */
    private static boolean landedOnHome(URI asked, URI landed) {
        return !isRoot(asked) && isRoot(landed);
    }

    private static boolean isRoot(URI u) {
        String path = u.getRawPath();
        return (path == null || path.isEmpty() || path.equals("/")) && u.getRawQuery() == null;
    }

    private static boolean looksLikeHtml(RemoteImages.Fetched f) {
        String type = f.contentType() == null ? "" : f.contentType().toLowerCase(java.util.Locale.ROOT);
        if (type.contains("html")) {
            return true;
        }
        String head = new String(f.bytes(), 0, Math.min(f.bytes().length, 512), StandardCharsets.UTF_8)
                .stripLeading().toLowerCase(java.util.Locale.ROOT);
        return head.startsWith("<!doctype html") || head.startsWith("<html");
    }

    private static byte[] bytes(Imgproxy.Rendered rendered) {
        if (rendered == null) {
            return null;
        }
        try (InputStream in = rendered.stream()) {
            return in.readAllBytes();
        } catch (IOException e) {
            return null;
        }
    }
}
