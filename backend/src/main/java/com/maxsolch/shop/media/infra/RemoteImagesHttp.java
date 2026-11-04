package com.maxsolch.shop.media.infra;

import com.maxsolch.shop.media.domain.MediaError;
import com.maxsolch.shop.media.domain.RemoteImages;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Downloads a picture (or the page around it) from the open internet. 5 s to connect, 20 s per hop, one retry of the
 * GET on a network error or 502–504; redirects are followed here, at most {@value #MAX_REDIRECTS}, and every hop
 * passes {@link PublicAddresses} again — a public link that redirects to 127.0.0.1 is still refused.
 */
@Component
public class RemoteImagesHttp implements RemoteImages {

    private static final HttpClientSettings HTTP = HttpClientSettings.defaults("remote-images")
            .withTimeouts(Duration.ofSeconds(5), Duration.ofSeconds(20))
            .withRetries(1, Duration.ofMillis(500));
    private static final int MAX_REDIRECTS = 3;
    /** Some CDNs refuse a client without a browser-like agent. */
    /**
     * A browser's Accept: shops (Shopify) send a product page asked with images first to the home page, so the
     * og:image would be the logo.
     */
    private static final String ACCEPT = "text/html,application/xhtml+xml,image/avif,image/webp,image/*,*/*;q=0.8";
    private static final String USER_AGENT = "Mozilla/5.0 (compatible; ChiSetupImageImport/1.0; +https://chisetup.com.ua)";

    private final ResilientHttp http;
    private final PublicAddresses.Resolver resolver;

    @Autowired
    public RemoteImagesHttp(HttpClients httpClients) {
        this(httpClients.create(HTTP), InetAddress::getAllByName);
    }

    RemoteImagesHttp(ResilientHttp http, PublicAddresses.Resolver resolver) {
        this.http = http;
        this.resolver = resolver;
    }

    @Override
    public Fetched fetch(URI url, long maxBytes) {
        URI current = url;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            guard(current);
            HttpResponse<InputStream> response = send(current);
            int status = response.statusCode();
            if (status >= 300 && status < 400) {
                closeQuietly(response.body());
                String location = response.headers().firstValue("Location").orElse(null);
                if (location == null) {
                    throw new DomainException.BadRequest(MediaError.IMAGE_FETCH_FAILED, "HTTP " + status);
                }
                current = resolve(current, location);
                continue;
            }
            if (status != 200) {
                closeQuietly(response.body());
                throw new DomainException.BadRequest(MediaError.IMAGE_FETCH_FAILED, "HTTP " + status);
            }
            byte[] body = readBounded(response.body(), maxBytes);
            return new Fetched(body, response.headers().firstValue("Content-Type").orElse(""), current);
        }
        throw new DomainException.BadRequest(MediaError.IMAGE_FETCH_FAILED, "too many redirects");
    }

    private void guard(URI url) {
        switch (PublicAddresses.check(url, resolver)) {
            case BAD_URL -> throw new DomainException.BadRequest(MediaError.IMAGE_URL_BAD);
            case BLOCKED -> throw new DomainException.BadRequest(MediaError.IMAGE_URL_BLOCKED);
            case OK -> { }
        }
    }

    private static URI resolve(URI base, String location) {
        try {
            return base.resolve(location.trim());
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(MediaError.IMAGE_URL_BAD);
        }
    }

    private HttpResponse<InputStream> send(URI url) {
        try {
            return http.send(HttpRequest.newBuilder(url)
                            .header("User-Agent", USER_AGENT)
                            .header("Accept", ACCEPT)
                            .GET().build(),
                    HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DomainException.BadRequest(MediaError.IMAGE_FETCH_FAILED, "interrupted");
        } catch (IOException | IllegalArgumentException e) {
            throw new DomainException.BadRequest(MediaError.IMAGE_FETCH_FAILED, e.getClass().getSimpleName());
        }
    }

    static byte[] readBounded(InputStream in, long maxBytes) {
        try (in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            long total = 0;
            for (int n = in.read(buf); n > 0; n = in.read(buf)) {
                total += n;
                if (total > maxBytes) {
                    throw new DomainException.BadRequest(MediaError.FILE_TOO_BIG, maxBytes / 1024 / 1024);
                }
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new DomainException.BadRequest(MediaError.IMAGE_FETCH_FAILED, e.getClass().getSimpleName());
        }
    }

    private static void closeQuietly(InputStream in) {
        try {
            in.close();
        } catch (IOException ignored) {
            // the connection is dropped either way
        }
    }
}
