package com.maxsolch.shop.media.infra;

import com.maxsolch.shop.media.domain.MediaError;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.ByteArrayInputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Import by link must not become a way to read MySQL, MinIO or the cloud metadata endpoint (SSRF). */
class PublicAddressesTest {

    private static PublicAddresses.Resolver resolvingTo(String ip) {
        return host -> new InetAddress[]{InetAddress.getByName(ip)};
    }

    @ParameterizedTest
    @ValueSource(strings = {"127.0.0.1", "10.0.0.5", "172.18.0.3", "192.168.1.1", "169.254.169.254", "100.100.1.1",
            "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"})
    void refusesInternalAddresses(String ip) {
        assertThat(PublicAddresses.check(URI.create("https://shop.example.com/a.jpg"), resolvingTo(ip)))
                .isEqualTo(PublicAddresses.Verdict.BLOCKED);
    }

    @Test
    void acceptsAPublicAddress() {
        assertThat(PublicAddresses.check(URI.create("https://cdn.shopify.com/a.jpg"), resolvingTo("23.227.38.65")))
                .isEqualTo(PublicAddresses.Verdict.OK);
    }

    @Test
    void refusesWhenAnyOfTheResolvedAddressesIsInternal() {
        PublicAddresses.Resolver mixed = host -> new InetAddress[]{
                InetAddress.getByName("23.227.38.65"), InetAddress.getByName("10.0.0.1")};
        assertThat(PublicAddresses.check(URI.create("https://x.example.com/a.jpg"), mixed))
                .isEqualTo(PublicAddresses.Verdict.BLOCKED);
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://minio:9000/a", "http://minio/a", "https://localhost/a", "http://imgproxy/x"})
    void refusesComposeNamesWithoutResolving(String url) {
        PublicAddresses.Resolver never = host -> {
            throw new AssertionError("must not resolve " + host);
        };
        PublicAddresses.Verdict v = PublicAddresses.check(URI.create(url), never);
        assertThat(v).isIn(PublicAddresses.Verdict.BLOCKED, PublicAddresses.Verdict.BAD_URL);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ftp://example.com/a.jpg", "file:///etc/passwd", "https://example.com:8443/a.jpg",
            "https://user:pw@example.com/a.jpg", "gopher://example.com/"})
    void refusesOtherSchemesPortsAndCredentials(String url) {
        assertThat(PublicAddresses.check(URI.create(url), resolvingTo("23.227.38.65")))
                .isEqualTo(PublicAddresses.Verdict.BAD_URL);
    }

    @Test
    void anUnknownHostIsABadLink() {
        PublicAddresses.Resolver none = host -> {
            throw new UnknownHostException(host);
        };
        assertThat(PublicAddresses.check(URI.create("https://nope.example.com/a.jpg"), none))
                .isEqualTo(PublicAddresses.Verdict.BAD_URL);
    }

    @Test
    void theAdapterChecksTheAddressBeforeAnyRequest() {
        // http is null: the guard must refuse before a request is even built
        RemoteImagesHttp remote = new RemoteImagesHttp(null, resolvingTo("169.254.169.254"));
        assertThatThrownBy(() -> remote.fetch(URI.create("https://metadata.example.com/latest"), 1024))
                .isInstanceOfSatisfying(DomainException.BadRequest.class,
                        e -> assertThat(e.errorCode()).isEqualTo(MediaError.IMAGE_URL_BLOCKED));
    }

    @Test
    void aBodyOverTheLimitIsRefused() {
        assertThatThrownBy(() -> RemoteImagesHttp.readBounded(new ByteArrayInputStream(new byte[2 * 1024 * 1024]), 1024 * 1024))
                .isInstanceOfSatisfying(DomainException.BadRequest.class,
                        e -> assertThat(e.errorCode()).isEqualTo(MediaError.FILE_TOO_BIG));
        assertThat(RemoteImagesHttp.readBounded(new ByteArrayInputStream(new byte[100]), 1024)).hasSize(100);
    }
}
