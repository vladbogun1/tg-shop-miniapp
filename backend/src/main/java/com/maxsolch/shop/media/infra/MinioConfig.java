package com.maxsolch.shop.media.infra;

import com.maxsolch.shop.platform.config.AppProperties;
import io.minio.MinioClient;
import io.minio.http.HttpUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class MinioConfig {

    /**
     * The library default is five minutes for connect, write and read, so a hung storage held a request thread
     * for that long. Photos are a few MB: 3 s to connect and 30 s per read or write is plenty.
     */
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    static final Duration IO_TIMEOUT = Duration.ofSeconds(30);

    @Bean
    public MinioClient minioClient(AppProperties props) {
        AppProperties.S3 s3 = props.getS3();
        return MinioClient.builder()
                .endpoint(s3.getEndpoint())
                .credentials(s3.getAccessKey(), s3.getSecretKey())
                .httpClient(HttpUtils.newDefaultHttpClient(CONNECT_TIMEOUT.toMillis(), IO_TIMEOUT.toMillis(),
                        IO_TIMEOUT.toMillis()))
                .build();
    }
}
