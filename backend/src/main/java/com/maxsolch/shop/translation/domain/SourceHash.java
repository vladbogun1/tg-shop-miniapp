package com.maxsolch.shop.translation.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** The fingerprint of a Russian source text: a translation applies only while its stored hash equals this. */
public final class SourceHash {

    private SourceHash() {
    }

    /** SHA-256, hex, lower case, of the exact UTF-8 bytes of the source as stored (no trim). */
    public static String sha256Hex(String source) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(source.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
