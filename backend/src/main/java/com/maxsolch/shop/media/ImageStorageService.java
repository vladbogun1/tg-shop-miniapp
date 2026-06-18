package com.maxsolch.shop.media;

import com.maxsolch.shop.config.AppProperties;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

/**
 * Stores uploaded files (product images, chat attachments) in MinIO/S3 and returns the
 * object key. The key (not a presigned URL) is persisted; the frontend builds a public URL
 * via imgproxy. Never exposes raw bytes.
 */
@Slf4j
@Service
public class ImageStorageService {

    private final MinioClient minioClient;
    private final String bucket;

    public ImageStorageService(MinioClient minioClient, AppProperties props) {
        this.minioClient = minioClient;
        this.bucket = props.getS3().getBucket();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void ensureBucket() {
        try {
            boolean exists = minioClient.bucketExists(
                    BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("Created MinIO bucket '{}'", bucket);
            }
        } catch (Exception e) {
            log.warn("Could not verify/create MinIO bucket '{}': {}", bucket, e.getMessage());
        }
    }

    /**
     * Upload a stream under the given key. Returns the key.
     */
    public String putObject(InputStream stream, long size, String contentType, String key) {
        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(stream, size, size < 0 ? 10L * 1024 * 1024 : -1)
                    .contentType(contentType == null ? "application/octet-stream" : contentType)
                    .build());
            return key;
        } catch (Exception e) {
            throw new RuntimeException("Failed to upload object to storage: " + e.getMessage(), e);
        }
    }

    /**
     * Upload an admin product image. Key layout: products/{uuid}/{filename}.
     */
    public String uploadProductImage(MultipartFile file) {
        String filename = sanitize(file.getOriginalFilename());
        String key = "products/" + UUID.randomUUID() + "/" + filename;
        return upload(file, key);
    }

    /**
     * Upload a chat attachment. Key layout: chat/{uuid}/{filename}.
     */
    public String uploadChatAttachment(MultipartFile file) {
        String filename = sanitize(file.getOriginalFilename());
        String key = "chat/" + UUID.randomUUID() + "/" + filename;
        return upload(file, key);
    }

    private String upload(MultipartFile file, String key) {
        try (InputStream in = file.getInputStream()) {
            return putObject(in, file.getSize(), file.getContentType(), key);
        } catch (IOException e) {
            throw new RuntimeException("Failed to read upload: " + e.getMessage(), e);
        }
    }

    private String sanitize(String name) {
        if (name == null || name.isBlank()) {
            return "file";
        }
        String base = name.replaceAll("[^A-Za-z0-9._-]", "_");
        return base.isBlank() ? "file" : base;
    }
}
