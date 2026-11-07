package com.maxsolch.shop.ai.app;

/**
 * The rotation a phone wrote into a JPEG's EXIF block (tag 0x0112): ImageIO ignores it, so a photo of an invoice taken
 * in portrait would reach the model lying on its side. Only the three rotations phones use (3, 6, 8) are applied;
 * mirrored variants are practically never produced by a camera and read as «no rotation».
 */
final class ExifOrientation {

    private ExifOrientation() {
    }

    /** Clockwise quarter turns to apply to the decoded picture: 0, 1, 2 or 3. */
    static int quarterTurns(byte[] jpeg) {
        int i = 2;
        while (i + 4 < jpeg.length && (jpeg[i] & 0xFF) == 0xFF) {
            int marker = jpeg[i + 1] & 0xFF;
            int len = ((jpeg[i + 2] & 0xFF) << 8) | (jpeg[i + 3] & 0xFF);
            if (marker == 0xE1 && len >= 16 && startsWithExif(jpeg, i + 4)) {
                return fromTiff(jpeg, i + 10, i + 2 + len);
            }
            if (marker == 0xDA || len < 2) {
                return 0;
            }
            i += 2 + len;
        }
        return 0;
    }

    private static boolean startsWithExif(byte[] b, int at) {
        return at + 6 <= b.length && b[at] == 'E' && b[at + 1] == 'x' && b[at + 2] == 'i' && b[at + 3] == 'f'
                && b[at + 4] == 0 && b[at + 5] == 0;
    }

    private static int fromTiff(byte[] b, int tiff, int end) {
        int limit = Math.min(end, b.length);
        if (tiff + 8 > limit) {
            return 0;
        }
        boolean little = b[tiff] == 'I';
        int ifd = tiff + u32(b, tiff + 4, little);
        if (ifd < 0 || ifd + 2 > limit) {
            return 0;
        }
        int entries = u16(b, ifd, little);
        for (int e = 0; e < entries; e++) {
            int at = ifd + 2 + e * 12;
            if (at + 12 > limit) {
                return 0;
            }
            if (u16(b, at, little) == 0x0112) {
                return switch (u16(b, at + 8, little)) {
                    case 3 -> 2;
                    case 6 -> 1;
                    case 8 -> 3;
                    default -> 0;
                };
            }
        }
        return 0;
    }

    private static int u16(byte[] b, int at, boolean little) {
        int a = b[at] & 0xFF;
        int c = b[at + 1] & 0xFF;
        return little ? (c << 8) | a : (a << 8) | c;
    }

    private static int u32(byte[] b, int at, boolean little) {
        int hi = u16(b, little ? at + 2 : at, little);
        int lo = u16(b, little ? at : at + 2, little);
        return (hi << 16) | lo;
    }
}
