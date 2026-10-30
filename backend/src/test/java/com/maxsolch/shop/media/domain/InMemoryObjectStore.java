package com.maxsolch.shop.media.domain;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.Map;

/** A stand-in for the S3 storage in unit tests of code that takes the {@link ObjectStore} port: no MinIO, no network. */
public class InMemoryObjectStore implements ObjectStore {

    private record Blob(byte[] bytes, String contentType) {
    }

    private final Map<String, Blob> objects = new LinkedHashMap<>();
    private boolean bucketEnsured;
    private boolean refusing;

    /** Makes {@link #put} fail like a storage that is down. */
    public InMemoryObjectStore refusing() {
        this.refusing = true;
        return this;
    }

    public boolean bucketEnsured() {
        return bucketEnsured;
    }

    public boolean contains(String key) {
        return objects.containsKey(key);
    }

    public int size() {
        return objects.size();
    }

    @Override
    public void ensureBucket() {
        bucketEnsured = true;
    }

    @Override
    public void put(String key, InputStream stream, long size, String contentType) {
        if (refusing) {
            throw new IllegalStateException("storage is down");
        }
        try {
            objects.put(key, new Blob(stream.readAllBytes(), contentType));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public Stored get(String key) {
        Blob b = objects.get(key);
        return b == null ? null : new Stored(new ByteArrayInputStream(b.bytes()), b.contentType());
    }

    @Override
    public void removeQuietly(String key) {
        objects.remove(key);
    }
}
