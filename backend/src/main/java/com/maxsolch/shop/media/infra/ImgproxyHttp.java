package com.maxsolch.shop.media.infra;

import com.maxsolch.shop.media.domain.Imgproxy;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * imgproxy over HTTP, from inside the compose network (its public path has no authorisation, so the call is made only
 * after the app accepted a signed link). 3 s to connect, 15 s for a render; a GET, but no retry is configured: the
 * caller falls back to the original.
 */
@Slf4j
@Component
public class ImgproxyHttp implements Imgproxy {

    private static final HttpClientSettings HTTP = HttpClientSettings.defaults("imgproxy")
            .withTimeouts(Duration.ofSeconds(3), Duration.ofSeconds(15));

    private final ResilientHttp http;
    private final String imgproxyUrl;
    private final String bucket;

    public ImgproxyHttp(MediaProperties props, HttpClients httpClients) {
        this.http = httpClients.create(HTTP);
        String url = props.getMedia().getImgproxyUrl();
        this.imgproxyUrl = url == null ? "" : url.replaceAll("/+$", "");
        this.bucket = props.getS3().getBucket();
    }

    @Override
    public Rendered fit(String objectKey, int width) {
        if (imgproxyUrl.isBlank()) {
            return null;
        }
        // rs:fit keeps the whole picture readable; cropping it to a square could cut off exactly
        // the part the shop needs to see.
        String url = imgproxyUrl + "/insecure/rs:fit:" + width + ":" + width
                + "/plain/s3://" + bucket + "/" + objectKey + "@webp";
        try {
            HttpResponse<InputStream> response = http.send(
                    HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(15)).GET().build(),
                    HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                response.body().close();
                log.debug("imgproxy returned {} for {}", response.statusCode(), objectKey);
                return null;
            }
            String contentType = response.headers().firstValue("Content-Type").orElse("image/webp");
            return new Rendered(response.body(), contentType);
        } catch (Exception e) {
            // Falling back to the original is slow but correct; failing the request is neither.
            log.debug("imgproxy unavailable for {}: {}", objectKey, e.toString());
            return null;
        }
    }
}
