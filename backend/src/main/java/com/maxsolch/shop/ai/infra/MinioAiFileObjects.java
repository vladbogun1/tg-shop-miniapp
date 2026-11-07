package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFileObjects;
import com.maxsolch.shop.platform.error.DomainException;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

/**
 * {@link AiFileObjects} over the MinIO client of the media module (its connect and read timeouts apply), in the bucket
 * {@code app.ai.files.bucket}. The bucket is created at start when missing; production gets its 7-day lifetime rule
 * from {@code infra/ai-files-bucket.sh}, which the application does not do itself (it has no admin rights on the bucket).
 */
@Slf4j
@Component
public class MinioAiFileObjects implements AiFileObjects {

    private final MinioClient client;
    private final String bucket;

    public MinioAiFileObjects(MinioClient client, AiProperties props) {
        this.client = client;
        this.bucket = props.getFiles().getBucket();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        ensureBucket();
    }

    @Override
    public void ensureBucket() {
        try {
            if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("Created MinIO bucket '{}' for AI files", bucket);
            }
        } catch (Exception e) {
            log.warn("Could not verify/create MinIO bucket '{}': {}", bucket, e.getMessage());
        }
    }

    @Override
    public void put(String key, byte[] bytes, String contentType) {
        try (InputStream in = new ByteArrayInputStream(bytes)) {
            client.putObject(PutObjectArgs.builder().bucket(bucket).object(key)
                    .stream(in, bytes.length, -1).contentType(contentType).build());
        } catch (Exception e) {
            log.warn("AI file '{}' was not stored: {}", key, e.getMessage());
            throw new DomainException.Unavailable(AiError.FILES_GONE, "storage");
        }
    }

    @Override
    public byte[] get(String key) {
        try (InputStream in = client.getObject(GetObjectArgs.builder().bucket(bucket).object(key).build())) {
            return in.readAllBytes();
        } catch (Exception e) {
            log.warn("Could not read AI file '{}': {}", key, e.getMessage());
            return null;
        }
    }

    @Override
    public void removeQuietly(String key) {
        try {
            client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
        } catch (Exception e) {
            log.warn("Could not delete AI file '{}': {}", key, e.getMessage());
        }
    }
}
