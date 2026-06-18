package com.maxsolch.migration;

import java.nio.ByteBuffer;
import java.util.UUID;

/**
 * BINARY(16) UUID conversion, MSB-first — identical to the OLD project's
 * {@code com.example.tgshop.common.UuidUtil}. The bytes are copied verbatim
 * from old to new, so this is only needed for logging / key building.
 */
public final class UuidUtil {

    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private UuidUtil() {
    }

    public static byte[] toBytes(UUID uuid) {
        ByteBuffer bb = ByteBuffer.wrap(new byte[16]);
        bb.putLong(uuid.getMostSignificantBits());
        bb.putLong(uuid.getLeastSignificantBits());
        return bb.array();
    }

    public static UUID fromBytes(byte[] bytes) {
        ByteBuffer bb = ByteBuffer.wrap(bytes);
        long high = bb.getLong();
        long low = bb.getLong();
        return new UUID(high, low);
    }

    /** Canonical dashed UUID string (e.g. {@code 11112222-...}). */
    public static String toUuidString(byte[] bytes) {
        if (bytes == null || bytes.length != 16) {
            return "00000000-0000-0000-0000-000000000000";
        }
        return fromBytes(bytes).toString();
    }

    /** Plain 32-char hex (no dashes) — handy for building object keys. */
    public static String toHex(byte[] bytes) {
        if (bytes == null) return null;
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int v = bytes[i] & 0xFF;
            out[i * 2] = HEX[v >>> 4];
            out[i * 2 + 1] = HEX[v & 0x0F];
        }
        return new String(out);
    }
}
