package com.maxsolch.shop.media.domain;

import java.io.InputStream;

/** Resized variants of stored images, rendered by imgproxy inside the compose network. */
public interface Imgproxy {

    /** A rendered picture. */
    record Rendered(InputStream stream, String contentType) {
    }

    /** A background colour, 0–255 per channel. */
    record Rgb(int r, int g, int b) {
    }

    /** The picture fitted into {@code width x width}, or null when imgproxy is off or unavailable (the caller falls back). */
    Rendered fit(String objectKey, int width);

    /** A small PNG of the whole picture (alpha kept) — enough to read the colour of its edges; null when unavailable. */
    Rendered preview(String objectKey, int width);

    /**
     * The shop's photo format: empty margins trimmed, the picture fitted (enlarged if needed) into a
     * {@code size - 2*padding} square centred on {@code background}, plus {@code padding} on each side — a
     * {@code size x size} WebP without metadata. Null when imgproxy is off or failed.
     */
    Rendered square(String objectKey, int size, int padding, Rgb background);
}
