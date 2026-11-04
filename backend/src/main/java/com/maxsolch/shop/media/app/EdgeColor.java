package com.maxsolch.shop.media.app;

import com.maxsolch.shop.media.domain.Imgproxy.Rgb;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Arrays;

/**
 * The background a photo is squared on: the colour of its own edges, so the added margins blend in (owner,
 * 2026-11-04: «квадрат 1600, свой фон»). The median of the outer ring per channel — a product that touches one side
 * does not tint it. A cut-out (mostly transparent edges) gets white, the usual shop-photo background.
 */
final class EdgeColor {

    static final Rgb WHITE = new Rgb(255, 255, 255);

    private EdgeColor() {
    }

    /** The edge colour of a small PNG preview; white when it cannot be read. */
    static Rgb ofPng(byte[] png) {
        if (png == null) {
            return WHITE;
        }
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(png));
            return img == null ? WHITE : of(img);
        } catch (IOException e) {
            return WHITE;
        }
    }

    static Rgb of(BufferedImage img) {
        int w = img.getWidth();
        int h = img.getHeight();
        int ring = Math.max(1, Math.min(w, h) / 32);
        int[] r = new int[2 * ring * (w + h)];
        int[] g = new int[r.length];
        int[] b = new int[r.length];
        int opaque = 0;
        int total = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                boolean edge = x < ring || y < ring || x >= w - ring || y >= h - ring;
                if (!edge) {
                    continue;
                }
                total++;
                int argb = img.getRGB(x, y);
                if ((argb >>> 24) < 128 || opaque >= r.length) {
                    continue;
                }
                r[opaque] = argb >> 16 & 0xFF;
                g[opaque] = argb >> 8 & 0xFF;
                b[opaque] = argb & 0xFF;
                opaque++;
            }
        }
        if (opaque * 2 < total) {
            return WHITE;
        }
        return new Rgb(median(r, opaque), median(g, opaque), median(b, opaque));
    }

    private static int median(int[] values, int n) {
        int[] copy = Arrays.copyOf(values, n);
        Arrays.sort(copy);
        return copy[n / 2];
    }
}
