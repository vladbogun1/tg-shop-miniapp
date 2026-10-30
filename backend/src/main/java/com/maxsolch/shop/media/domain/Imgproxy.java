package com.maxsolch.shop.media.domain;

import java.io.InputStream;

/** Resized variants of stored images, rendered by imgproxy inside the compose network. */
public interface Imgproxy {

    /** A rendered picture. */
    record Rendered(InputStream stream, String contentType) {
    }

    /** The picture fitted into {@code width x width}, or null when imgproxy is off or unavailable (the caller falls back). */
    Rendered fit(String objectKey, int width);
}
