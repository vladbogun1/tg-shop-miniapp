package com.maxsolch.shop.media.app;

/**
 * What a downloaded file really is, read from its first bytes (a site's Content-Type is often wrong or
 * "application/octet-stream"), and its pixel size when the format makes that cheap. Only formats imgproxy decodes.
 */
record ImageHeader(String contentType, String extension, int width, int height) {

    /** Width/height are unknown (0) for AVIF/HEIC: their size sits deep in ISO-BMFF boxes. */
    boolean sizeKnown() {
        return width > 0 && height > 0;
    }

    /** The header, or null when the bytes are not a supported picture (an HTML page, an SVG, garbage). */
    static ImageHeader of(byte[] b) {
        if (b == null || b.length < 12) {
            return null;
        }
        if (u8(b, 0) == 0xFF && u8(b, 1) == 0xD8 && u8(b, 2) == 0xFF) {
            int[] size = jpegSize(b);
            return new ImageHeader("image/jpeg", "jpg", size[0], size[1]);
        }
        if (u8(b, 0) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return new ImageHeader("image/png", "png", b.length >= 24 ? be32(b, 16) : 0, b.length >= 24 ? be32(b, 20) : 0);
        }
        if (b[0] == 'G' && b[1] == 'I' && b[2] == 'F' && b[3] == '8') {
            return new ImageHeader("image/gif", "gif", le16(b, 6), le16(b, 8));
        }
        if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) {
            int[] size = webpSize(b);
            return new ImageHeader("image/webp", "webp", size[0], size[1]);
        }
        if (ascii(b, 4, "ftyp")) {
            String brand = new String(b, 8, 4, java.nio.charset.StandardCharsets.US_ASCII);
            if (brand.startsWith("avi")) {
                return new ImageHeader("image/avif", "avif", 0, 0);
            }
            if (brand.startsWith("hei") || brand.startsWith("mif") || brand.startsWith("hev")) {
                return new ImageHeader("image/heic", "heic", 0, 0);
            }
        }
        return null;
    }

    private static int[] jpegSize(byte[] b) {
        int i = 2;
        while (i + 9 < b.length) {
            if (u8(b, i) != 0xFF) {
                i++;
                continue;
            }
            int marker = u8(b, i + 1);
            boolean sof = marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC;
            if (sof) {
                return new int[]{be16(b, i + 7), be16(b, i + 5)};
            }
            if (marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7) || marker == 0xFF) {
                i += marker == 0xFF ? 1 : 2;
                continue;
            }
            i += 2 + be16(b, i + 2);
        }
        return new int[]{0, 0};
    }

    private static int[] webpSize(byte[] b) {
        if (b.length < 30) {
            return new int[]{0, 0};
        }
        if (ascii(b, 12, "VP8 ")) {
            return new int[]{le16(b, 26) & 0x3FFF, le16(b, 28) & 0x3FFF};
        }
        if (ascii(b, 12, "VP8L")) {
            int bits = u8(b, 21) | u8(b, 22) << 8 | u8(b, 23) << 16 | u8(b, 24) << 24;
            return new int[]{(bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1};
        }
        if (ascii(b, 12, "VP8X")) {
            return new int[]{(u8(b, 24) | u8(b, 25) << 8 | u8(b, 26) << 16) + 1, (u8(b, 27) | u8(b, 28) << 8 | u8(b, 29) << 16) + 1};
        }
        return new int[]{0, 0};
    }

    private static boolean ascii(byte[] b, int at, String s) {
        if (b.length < at + s.length()) {
            return false;
        }
        for (int i = 0; i < s.length(); i++) {
            if (b[at + i] != s.charAt(i)) {
                return false;
            }
        }
        return true;
    }

    private static int u8(byte[] b, int i) {
        return b[i] & 0xFF;
    }

    private static int be16(byte[] b, int i) {
        return u8(b, i) << 8 | u8(b, i + 1);
    }

    private static int le16(byte[] b, int i) {
        return u8(b, i) | u8(b, i + 1) << 8;
    }

    private static int be32(byte[] b, int i) {
        return be16(b, i) << 16 | be16(b, i + 2);
    }
}
