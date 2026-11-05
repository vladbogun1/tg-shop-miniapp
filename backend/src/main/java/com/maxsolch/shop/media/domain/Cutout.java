package com.maxsolch.shop.media.domain;

/** Cuts the product out of a photo (the {@code cutout} service inside the compose network). */
public interface Cutout {

    /**
     * The product alone, as a PNG with alpha cropped to it. Null when there is nothing to cut (no object, or no
     * background around it), or when the service is off or failed — the caller then squares the photo as it is.
     */
    byte[] cut(byte[] image, String contentType);
}
