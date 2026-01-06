package com.example.tgshop.common;

import java.nio.ByteBuffer;
import java.util.UUID;

public final class UuidUtil {
  private UuidUtil() {}

  public static byte[] toBytes(UUID uuid) {
    var bb = ByteBuffer.wrap(new byte[16]);
    bb.putLong(uuid.getMostSignificantBits());
    bb.putLong(uuid.getLeastSignificantBits());
    return bb.array();
  }

  public static UUID fromBytes(byte[] bytes) {
    var bb = ByteBuffer.wrap(bytes);
    long high = bb.getLong();
    long low = bb.getLong();
    return new UUID(high, low);
  }
}
