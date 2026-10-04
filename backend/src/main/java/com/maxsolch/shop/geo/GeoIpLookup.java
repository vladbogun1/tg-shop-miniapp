package com.maxsolch.shop.geo;

import com.maxmind.db.CHMCache;
import com.maxmind.geoip2.DatabaseReader;
import com.maxmind.geoip2.model.CityResponse;
import com.maxmind.geoip2.record.Location;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.File;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.InetAddress;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * IP address -> approximate place (country, city, coordinates), from an offline {@code .mmdb} file.
 *
 * <p>The file is DB-IP "IP to City Lite" (CC BY 4.0, https://db-ip.com), downloaded into the backend
 * image at build time (see backend/Dockerfile); MaxMind GeoLite2-City works too — same format.
 * Its path is {@code app.geoip.path}. No file, an unreadable one, or an empty path simply turns the
 * lookup off: {@link #lookup} returns empty and the admin map shows no points — nothing else changes.
 *
 * <p>Never does a DNS lookup: only literal IPv4/IPv6 strings reach {@link InetAddress#getByName}.
 * Private, loopback and link-local addresses (our own proxies, local dev) are skipped.
 */
@Slf4j
@Component
public class GeoIpLookup {

    private static final Pattern IPV4 = Pattern.compile("\\d{1,3}(\\.\\d{1,3}){3}");
    private static final Pattern IPV6 = Pattern.compile("[0-9A-Fa-f:.]+");

    /** Names in Russian when the base has them (the admin is Russian), English otherwise. */
    private static final List<String> LOCALES = List.of("ru", "en");

    public record Place(String countryCode, String country, String city, BigDecimal lat, BigDecimal lon) {
    }

    private final DatabaseReader reader;

    public GeoIpLookup(@Value("${app.geoip.path:}") String path) {
        this.reader = open(path);
    }

    private static DatabaseReader open(String path) {
        if (path == null || path.isBlank()) {
            log.info("GeoIP: app.geoip.path is empty — the users map is off");
            return null;
        }
        File file = new File(path.trim());
        if (!file.isFile()) {
            log.info("GeoIP: no database at {} — the users map shows no points", file);
            return null;
        }
        try {
            DatabaseReader r = new DatabaseReader.Builder(file).locales(LOCALES).withCache(new CHMCache()).build();
            log.info("GeoIP: {} loaded ({} built {})", file, r.getMetadata().getDatabaseType(),
                    r.getMetadata().getBuildDate());
            return r;
        } catch (Exception | LinkageError e) {
            log.warn("GeoIP: cannot open {} — the users map is off: {}", file, e.toString());
            return null;
        }
    }

    public boolean available() {
        return reader != null;
    }

    public Optional<Place> lookup(String ip) {
        if (reader == null || !isPublicLiteral(ip)) {
            return Optional.empty();
        }
        try {
            Optional<CityResponse> found = reader.tryCity(InetAddress.getByName(ip));
            if (found.isEmpty()) {
                return Optional.empty();
            }
            CityResponse r = found.get();
            Location loc = r.getLocation();
            BigDecimal lat = loc == null || loc.getLatitude() == null ? null : round(loc.getLatitude());
            BigDecimal lon = loc == null || loc.getLongitude() == null ? null : round(loc.getLongitude());
            return Optional.of(new Place(
                    cut(r.getCountry() == null ? null : r.getCountry().getIsoCode(), 2),
                    cut(r.getCountry() == null ? null : r.getCountry().getName(), 100),
                    cut(r.getCity() == null ? null : r.getCity().getName(), 120),
                    lat, lon));
        } catch (Exception e) {
            log.debug("GeoIP lookup failed for {}: {}", ip, e.toString());
            return Optional.empty();
        }
    }

    /** A literal, routable address — never a hostname (no DNS), never our own network. */
    static boolean isPublicLiteral(String ip) {
        if (ip == null || ip.isBlank() || ip.length() > 45) {
            return false;
        }
        boolean v4 = IPV4.matcher(ip).matches();
        boolean v6 = !v4 && ip.indexOf(':') >= 0 && IPV6.matcher(ip).matches();
        if (!v4 && !v6) {
            return false;
        }
        try {
            InetAddress a = InetAddress.getByName(ip);
            return !(a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress()
                    || a.isAnyLocalAddress() || a.isMulticastAddress() || isUniqueLocalV6(a));
        } catch (Exception e) {
            return false;
        }
    }

    /** fc00::/7 — IPv6's private range, which {@link InetAddress#isSiteLocalAddress} does not cover. */
    private static boolean isUniqueLocalV6(InetAddress a) {
        byte[] b = a.getAddress();
        return b.length == 16 && (b[0] & 0xFE) == 0xFC;
    }

    private static BigDecimal round(double v) {
        return BigDecimal.valueOf(v).setScale(4, RoundingMode.HALF_UP);
    }

    private static String cut(String v, int max) {
        if (v == null || v.isBlank()) {
            return null;
        }
        return v.length() <= max ? v : v.substring(0, max);
    }

    @PreDestroy
    void close() {
        if (reader != null) {
            try {
                reader.close();
            } catch (Exception ignored) {
                // shutting down anyway
            }
        }
    }
}
