package com.maxsolch.shop.media.infra;

import com.maxsolch.shop.media.domain.ObjectStore;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.InputStream;

/** {@link ObjectStore} over MinIO/S3; the client has its own connect and read timeouts ({@link MinioConfig}). */
@Slf4j
@Component
public class MinioObjectStore implements ObjectStore {

    private final MinioClient client;
    private final String bucket;

    public MinioObjectStore(MinioClient client, MediaProperties props) {
        this.client = client;
        this.bucket = props.getS3().getBucket();
    }

    @Override
    public void ensureBucket() {
        try {
            boolean exists = client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("Created MinIO bucket '{}'", bucket);
            }
        } catch (Exception e) {
            log.warn("Could not verify/create MinIO bucket '{}': {}", bucket, e.getMessage());
        }
    }

    @Override
    public void put(String key, InputStream stream, long size, String contentType) {
        try {
            client.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(stream, size, size < 0 ? 10L * 1024 * 1024 : -1)
                    .contentType(contentType == null ? "application/octet-stream" : contentType)
                    .build());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to upload object to storage: " + e.getMessage(), e);
        }
    }

    @Override
    public Stored get(String key) {
        try {
            StatObjectResponse stat = client.statObject(StatObjectArgs.builder().bucket(bucket).object(key).build());
            InputStream stream = client.getObject(GetObjectArgs.builder().bucket(bucket).object(key).build());
            return new Stored(stream, stat.contentType());
        } catch (Exception e) {
            log.warn("Could not read object '{}': {}", key, e.getMessage());
            return null;
        }
    }

    @Override
    public void removeQuietly(String key) {
        try {
            client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
            log.info("Deleted orphaned object '{}'", key);
        } catch (Exception e) {
            log.warn("Could not delete object '{}': {}", key, e.getMessage());
        }
    }
}
