package com.maxsolch.shop.media.domain;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;

/** A stand-in for imgproxy: "renders" a picture of the asked key and width, or answers null like an imgproxy that is off. */
public class FakeImgproxy implements Imgproxy {

    private final boolean available;
    private final List<String> asked = new ArrayList<>();
    private byte[] previewPng;

    public FakeImgproxy(boolean available) {
        this.available = available;
    }

    /** The PNG that {@link #preview} answers with (null = like a failed render). */
    public FakeImgproxy withPreview(byte[] png) {
        this.previewPng = png;
        return this;
    }

    /** The calls so far, as {@code key@width} (fit), {@code preview:key@width}, {@code square:key@size/pad/r,g,b}. */
    public List<String> asked() {
        return asked;
    }

    @Override
    public Rendered fit(String objectKey, int width) {
        asked.add(objectKey + "@" + width);
        return available
                ? new Rendered(new ByteArrayInputStream(("img:" + objectKey + ":" + width).getBytes()), "image/webp")
                : null;
    }

    @Override
    public Rendered preview(String objectKey, int width) {
        asked.add("preview:" + objectKey + "@" + width);
        return available && previewPng != null ? new Rendered(new ByteArrayInputStream(previewPng), "image/png") : null;
    }

    @Override
    public Rendered square(String objectKey, int size, int padding, Rgb bg) {
        asked.add("square:" + objectKey + "@" + size + "/" + padding + "/" + bg.r() + "," + bg.g() + "," + bg.b());
        return available
                ? new Rendered(new ByteArrayInputStream(("sq:" + objectKey).getBytes()), "image/webp")
                : null;
    }
}
