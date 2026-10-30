package com.maxsolch.shop.media.domain;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;

/** A stand-in for imgproxy: "renders" a picture of the asked key and width, or answers null like an imgproxy that is off. */
public class FakeImgproxy implements Imgproxy {

    private final boolean available;
    private final List<String> asked = new ArrayList<>();

    public FakeImgproxy(boolean available) {
        this.available = available;
    }

    /** The calls so far, as {@code key@width}. */
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
}
