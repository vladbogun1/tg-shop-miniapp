package com.maxsolch.shop.media.infra;

import com.maxsolch.shop.media.domain.Cutout;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * The cut-out service over HTTP (internal, like imgproxy). 3 s to connect, 45 s for the answer: a cut takes ~11 s on
 * the server and the service does one at a time, so a second photo of the admin's two parallel ones waits for the
 * first. No retry — a slow or failed cut falls back to the plain square, which is better than holding the admin.
 */
@Slf4j
@Component
public class CutoutHttp implements Cutout {

    private static final HttpClientSettings HTTP = HttpClientSettings.defaults("cutout")
            .withTimeouts(Duration.ofSeconds(3), Duration.ofSeconds(45))
            .withHttp11();

    private final ResilientHttp http;
    private final String url;

    public CutoutHttp(MediaProperties props, HttpClients httpClients) {
        this.http = httpClients.create(HTTP);
        String base = props.getMedia().getCutoutUrl();
        this.url = base == null ? "" : base.replaceAll("/+$", "");
    }

    @Override
    public byte[] cut(byte[] image, String contentType) {
        if (url.isBlank()) {
            return null;
        }
        try {
            HttpResponse<byte[]> response = http.send(
                    HttpRequest.newBuilder(URI.create(url + "/cutout"))
                            .header("Content-Type", contentType == null ? "application/octet-stream" : contentType)
                            .POST(HttpRequest.BodyPublishers.ofByteArray(image))
                            .build(),
                    HttpResponse.BodyHandlers.ofByteArray(), false);
            if (response.statusCode() != 200) {
                // 422 = nothing to cut (no object, or no background around it); 400 = not an image
                log.info("cutout answered {}: the photo is squared as it is", response.statusCode());
                return null;
            }
            return response.body();
        } catch (Exception e) {
            log.warn("cutout unavailable, the photo is squared as it is: {}", e.toString());
            return null;
        }
    }
}
