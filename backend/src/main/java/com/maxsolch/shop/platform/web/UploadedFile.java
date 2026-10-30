package com.maxsolch.shop.platform.web;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;

/**
 * A file the client uploaded, as the app layer sees it: the controller wraps Spring's {@code MultipartFile}
 * ({@link #of}), so scenarios and validators never import {@code org.springframework.web.*}.
 */
public interface UploadedFile {

    String getOriginalFilename();

    String getContentType();

    long getSize();

    boolean isEmpty();

    byte[] getBytes() throws IOException;

    InputStream getInputStream() throws IOException;

    /** Wraps a multipart part; {@code null} stays {@code null} (an absent part). */
    static UploadedFile of(MultipartFile file) {
        if (file == null) {
            return null;
        }
        return new UploadedFile() {
            @Override
            public String getOriginalFilename() {
                return file.getOriginalFilename();
            }

            @Override
            public String getContentType() {
                return file.getContentType();
            }

            @Override
            public long getSize() {
                return file.getSize();
            }

            @Override
            public boolean isEmpty() {
                return file.isEmpty();
            }

            @Override
            public byte[] getBytes() throws IOException {
                return file.getBytes();
            }

            @Override
            public InputStream getInputStream() throws IOException {
                return file.getInputStream();
            }
        };
    }
}
