package com.maxsolch.shop.media;

import com.maxsolch.shop.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Set;

/**
 * Resized variants of private attachments, produced by the imgproxy that already sits in the stack
 * for product photos.
 *
 * <p>{@code /api/media} used to stream the stored original. A payment screenshot straight off a
 * phone is several megabytes, and the chat asked for that same file for a bubble barely 260px
 * wide — which is why photos took so long to appear, and sometimes appeared to not load at all.
 *
 * <p>imgproxy itself must stay out of reach for this bucket prefix: chat attachments are private
 * and the public {@code /img/insecure/...} path has no authorisation. So the request is made from
 * inside the compose network, only after {@link MediaSigner} has accepted the signature, and the
 * bytes are streamed back through the API.
 */
@Slf4j
@Component
public class MediaThumbnailer {

    /**
     * Sizes the apps may ask for. A closed set, so a valid link cannot be turned into an unbounded
     * "render this at 10 000 different sizes" CPU sink.
     */
    private static final Set<Integer> ALLOWED_WIDTHS = Set.of(320, 480, 960, 1600);

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    private final String imgproxyUrl;
    private final String bucket;

    public MediaThumbnailer(AppProperties props,
                            @Value("${app.media.imgproxy-url:http://imgproxy:8080}") String imgproxyUrl) {
        this.imgproxyUrl = imgproxyUrl == null ? "" : imgproxyUrl.replaceAll("/+$", "");
        this.bucket = props.getS3().getBucket();
    }

    public static boolean isAllowedWidth(Integer width) {
        return width != null && ALLOWED_WIDTHS.contains(width);
    }

    /** A rendered variant, or null when imgproxy is unavailable and the caller should fall back. */
    public Variant render(String objectKey, int width) {
        if (imgproxyUrl.isBlank()) {
            return null;
        }
        // rs:fit keeps the whole screenshot readable; cropping a payment slip to a square would
        // cut off exactly the part the shop needs to see.
        String url = imgproxyUrl + "/insecure/rs:fit:" + width + ":" + width
                + "/plain/s3://" + bucket + "/" + objectKey + "@webp";
        try {
            HttpResponse<InputStream> response = http.send(
                    HttpRequest.newBuilder(URI.create(url))
                            .timeout(Duration.ofSeconds(15))
                            .GET()
                            .build(),
                    HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                response.body().close();
                log.debug("imgproxy returned {} for {}", response.statusCode(), objectKey);
                return null;
            }
            String contentType = response.headers().firstValue("Content-Type").orElse("image/webp");
            return new Variant(response.body(), contentType);
        } catch (Exception e) {
            // Falling back to the original is slow but correct; failing the request is neither.
            log.debug("imgproxy unavailable for {}: {}", objectKey, e.toString());
            return null;
        }
    }

    public record Variant(InputStream stream, String contentType) {
    }
}
