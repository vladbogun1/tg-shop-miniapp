package com.maxsolch.shop.media.infra;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * What the media module reads of {@code app.*}: object storage (S3/MinIO), imgproxy, the key that signs image links.
 * Binds a part of the {@code app.*} tree; keys and environment names are the same as before the split. Other
 * modules bind their own part of the same tree.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class MediaProperties {

    private S3 s3 = new S3();
    private Media media = new Media();
    private Security security = new Security();

    @Getter
    @Setter
    public static class S3 {
        private String endpoint;
        private String accessKey;
        private String secretKey;
        private String bucket;
    }

    @Getter
    @Setter
    public static class Media {
        /** imgproxy base URL; blank = thumbnails off and callers fall back to the original. */
        private String imgproxyUrl = "http://imgproxy:8080";
    }

    @Getter
    @Setter
    public static class Security {
        /** Base64-encoded HS256 secret. */
        private String jwtSecret;
    }
}
