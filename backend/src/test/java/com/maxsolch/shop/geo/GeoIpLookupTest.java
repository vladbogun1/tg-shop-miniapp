package com.maxsolch.shop.geo;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class GeoIpLookupTest {

    @Test
    void noDatabase_lookupIsOffAndQuiet() {
        GeoIpLookup none = new GeoIpLookup("");
        assertThat(none.available()).isFalse();
        assertThat(none.lookup("8.8.8.8")).isEmpty();

        GeoIpLookup missing = new GeoIpLookup("/definitely/not/here.mmdb");
        assertThat(missing.available()).isFalse();
        assertThat(missing.lookup("8.8.8.8")).isEmpty();
    }

    /** Runs only with a real base: GEOIP_TEST_DB=/path/to/dbip-city-lite.mmdb mvn test. */
    @Test
    void realBase_placesAPublicAddress() {
        String path = System.getenv("GEOIP_TEST_DB");
        assumeTrue(path != null && !path.isBlank(), "GEOIP_TEST_DB not set");
        GeoIpLookup lookup = new GeoIpLookup(path);
        assertThat(lookup.available()).isTrue();
        GeoIpLookup.Place p = lookup.lookup("8.8.8.8").orElseThrow();
        assertThat(p.countryCode()).isEqualTo("US");
        assertThat(p.lat()).isNotNull();
        assertThat(p.lon()).isNotNull();
        assertThat(lookup.lookup("192.168.1.1")).isEmpty();
    }

    @Test
    void onlyPublicLiteralAddresses_neverHostnames() {
        assertThat(GeoIpLookup.isPublicLiteral("8.8.8.8")).isTrue();
        assertThat(GeoIpLookup.isPublicLiteral("2a00:1450:4001:80b::200e")).isTrue();

        assertThat(GeoIpLookup.isPublicLiteral("127.0.0.1")).isFalse();
        assertThat(GeoIpLookup.isPublicLiteral("10.1.2.3")).isFalse();
        assertThat(GeoIpLookup.isPublicLiteral("172.18.0.5")).isFalse();
        assertThat(GeoIpLookup.isPublicLiteral("192.168.1.1")).isFalse();
        assertThat(GeoIpLookup.isPublicLiteral("::1")).isFalse();
        assertThat(GeoIpLookup.isPublicLiteral("fd12:3456::1")).isFalse();
        assertThat(GeoIpLookup.isPublicLiteral("fe80::1")).isFalse();
        // would be a DNS lookup if it ever reached InetAddress.getByName
        assertThat(GeoIpLookup.isPublicLiteral("example.com")).isFalse();
        assertThat(GeoIpLookup.isPublicLiteral("cafe")).isFalse();
        assertThat(GeoIpLookup.isPublicLiteral("unknown")).isFalse();
        assertThat(GeoIpLookup.isPublicLiteral(null)).isFalse();
    }
}
