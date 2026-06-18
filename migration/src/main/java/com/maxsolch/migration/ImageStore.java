package com.maxsolch.migration;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;

/**
 * Thin wrapper over the MinIO Java SDK. Streams object bytes (no full buffering
 * beyond what the caller already holds) and lazily creates the bucket.
 */
public class ImageStore {

    private static final Logger log = LoggerFactory.getLogger(ImageStore.class);

    private final MinioClient client;
    private final String bucket;

    public ImageStore(MigrationConfig cfg) {
        this.client = MinioClient.builder()
                .endpoint(cfg.s3Endpoint)
                .credentials(cfg.s3AccessKey, cfg.s3SecretKey)
                .build();
        this.bucket = cfg.s3Bucket;
    }

    public void ensureBucket() throws Exception {
        boolean exists = client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
        if (!exists) {
            client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            log.info("Created MinIO bucket '{}'", bucket);
        } else {
            log.info("MinIO bucket '{}' already exists", bucket);
        }
    }

    /**
     * Uploads {@code data} under {@code objectKey} with the given content type.
     * Streams the bytes from an InputStream so a single large blob never gets
     * double-buffered. Idempotent: re-uploading the same key overwrites it.
     */
    public void put(String objectKey, byte[] data, String contentType) throws Exception {
        String ct = (contentType == null || contentType.isBlank()) ? "application/octet-stream" : contentType;
        try (InputStream in = new java.io.ByteArrayInputStream(data)) {
            client.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .stream(in, data.length, -1)
                    .contentType(ct)
                    .build());
        }
    }

    public String bucket() {
        return bucket;
    }
}
