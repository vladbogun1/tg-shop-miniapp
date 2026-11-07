package com.maxsolch.shop.ai.domain;

/**
 * Where the bytes of {@link AiFile}s live: an S3-compatible bucket of their own (not the one of the product photos),
 * with a lifetime rule of 7 days on the bucket itself as the second line behind the nightly cleanup.
 * The adapter bounds every call by a timeout.
 */
public interface AiFileObjects {

    /** Creates the bucket when it is missing; never throws (the storage may come up later). */
    void ensureBucket();

    /** Throws {@link com.maxsolch.shop.platform.error.DomainException.Unavailable} when the storage refuses. */
    void put(String key, byte[] bytes, String contentType);

    /** The bytes, or null when the object does not exist or cannot be read. */
    byte[] get(String key);

    /** Best effort: never throws; a lost delete is caught by the lifetime rule of the bucket. */
    void removeQuietly(String key);
}
