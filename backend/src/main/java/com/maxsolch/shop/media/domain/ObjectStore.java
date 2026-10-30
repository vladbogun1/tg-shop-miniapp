package com.maxsolch.shop.media.domain;

import java.io.InputStream;

/**
 * Where the bytes of uploaded files live (S3-compatible storage). The port of the media module: the app decides keys,
 * names and what may be read; the adapter in {@code media.infra} talks to the storage and bounds every call by a timeout.
 */
public interface ObjectStore {

    /** An object's bytes plus the content type it was stored with. */
    record Stored(InputStream stream, String contentType) {
    }

    /** Creates the bucket when it is missing; never throws (the storage may come up later). */
    void ensureBucket();

    /** Stores a stream under {@code key}; {@code size < 0} when unknown. Throws IllegalStateException when the storage refuses. */
    void put(String key, InputStream stream, long size, String contentType);

    /** The object, or null when it does not exist or cannot be read. */
    Stored get(String key);

    /** Best effort: never throws, a lost delete must not fail the action of a person. */
    void removeQuietly(String key);
}
