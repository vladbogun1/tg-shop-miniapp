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
 * after the app accepted a signed link). 3 s to connect, 15 s for a render (30 s for the square: trim + enlarge of a
 * big original); a GET, but no retry is configured: the caller falls back or reports the failure.
 */
@Slf4j
@Component
public class ImgproxyHttp implements Imgproxy {

    private static final HttpClientSettings HTTP = HttpClientSettings.defaults("imgproxy")
            .withTimeouts(Duration.ofSeconds(3), Duration.ofSeconds(15));
    private static final Duration SQUARE_TIMEOUT = Duration.ofSeconds(30);
    /** Colour distance for trim: JPEG noise around a flat background stays under it, a product's edge does not. */
    private static final int TRIM_THRESHOLD = 12;

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
        // rs:fit keeps the whole picture readable; cropping it to a square could cut off exactly
        // the part the shop needs to see.
        return get(objectKey, "rs:fit:" + width + ":" + width, "webp", Duration.ofSeconds(15));
    }

    @Override
    public Rendered preview(String objectKey, int width) {
        return get(objectKey, "rs:fit:" + width + ":" + width, "png", Duration.ofSeconds(15));
    }

    @Override
    public Rendered square(String objectKey, int size, int padding, Rgb bg, boolean trim) {
        int inner = size - 2 * padding;
        // t = trim the flat margins (colour taken from the top-left pixel), rs:fit:W:H:enlarge:extend = fit into the
        // inner square, enlarging small pictures, and extend the canvas to it; bg fills the extension and any
        // transparency; pd adds the even margin on every side. imgproxy strips metadata by default.
        String options = (trim ? "t:" + TRIM_THRESHOLD + "/" : "") + "rs:fit:" + inner + ":" + inner + ":1:1/g:ce"
                + "/bg:" + bg.r() + ":" + bg.g() + ":" + bg.b() + "/pd:" + padding + "/q:90";
        return get(objectKey, options, "webp", SQUARE_TIMEOUT);
    }

    private Rendered get(String objectKey, String options, String format, Duration timeout) {
        if (imgproxyUrl.isBlank()) {
            return null;
        }
        String url = imgproxyUrl + "/insecure/" + options + "/plain/s3://" + bucket + "/" + objectKey + "@" + format;
        try {
            HttpResponse<InputStream> response = http.send(
                    HttpRequest.newBuilder(URI.create(url)).timeout(timeout).GET().build(),
                    HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                response.body().close();
                log.debug("imgproxy returned {} for {}", response.statusCode(), objectKey);
                return null;
            }
            String contentType = response.headers().firstValue("Content-Type").orElse("image/" + format);
            return new Rendered(response.body(), contentType);
        } catch (Exception e) {
            // Falling back to the original is slow but correct; failing the request is neither.
            log.debug("imgproxy unavailable for {}: {}", objectKey, e.toString());
            return null;
        }
    }
}
