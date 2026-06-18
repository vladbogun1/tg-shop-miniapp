package com.maxsolch.shop.web.dto;

/**
 * Generic upload response. {@code key}/{@code url} both expose the stored S3 key.
 */
public record UploadResponse(String key, String url) {

    public static UploadResponse ofKey(String key) {
        return new UploadResponse(key, key);
    }
}
