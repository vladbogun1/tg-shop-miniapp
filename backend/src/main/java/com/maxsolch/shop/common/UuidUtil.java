package com.maxsolch.shop.common;

import java.nio.ByteBuffer;
import java.util.UUID;

/**
 * Converts between {@link UUID} and a 16-byte array using the most-significant-bits-first
 * (big-endian) layout. This matches MySQL's {@code UUID_TO_BIN(uuid, 0)} (swap flag = 0),
 * so byte[] ids produced here are binary-compatible with the seed/migration data.
 */
public final class UuidUtil {

    private UuidUtil() {
    }

    /** UUID -> 16 bytes, MSB first. */
    public static byte[] toBytes(UUID uuid) {
        if (uuid == null) {
            return null;
        }
        ByteBuffer bb = ByteBuffer.allocate(16);
        bb.putLong(uuid.getMostSignificantBits());
        bb.putLong(uuid.getLeastSignificantBits());
        return bb.array();
    }

    /** 16 bytes (MSB first) -> UUID. */
    public static UUID toUuid(byte[] bytes) {
        if (bytes == null) {
            return null;
        }
        if (bytes.length != 16) {
            throw new IllegalArgumentException("Expected 16 bytes for UUID, got " + bytes.length);
        }
        ByteBuffer bb = ByteBuffer.wrap(bytes);
        long msb = bb.getLong();
        long lsb = bb.getLong();
        return new UUID(msb, lsb);
    }

    /** Convenience: random UUID directly as 16 bytes. */
    public static byte[] randomBytes() {
        return toBytes(UUID.randomUUID());
    }

    /** Convenience: parse a UUID string into 16 bytes. */
    public static byte[] toBytes(String uuid) {
        return toBytes(UUID.fromString(uuid));
    }

    /** Convenience: 16 bytes -> canonical UUID string. */
    public static String toString(byte[] bytes) {
        UUID u = toUuid(bytes);
        return u == null ? null : u.toString();
    }
}
