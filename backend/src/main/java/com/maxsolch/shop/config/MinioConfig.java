package com.maxsolch.shop.config;

import io.minio.MinioClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioConfig {

    @Bean
    public MinioClient minioClient(AppProperties props) {
        AppProperties.S3 s3 = props.getS3();
        return MinioClient.builder()
                .endpoint(s3.getEndpoint())
                .credentials(s3.getAccessKey(), s3.getSecretKey())
                .build();
    }
}
