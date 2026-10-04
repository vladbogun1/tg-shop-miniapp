package com.maxsolch.shop.security;

import com.maxsolch.shop.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

/**
 * Issues and validates HS256 JWTs. Subject = telegram user id, custom claims {@code role} and
 * {@code tv} (token version — see {@link AdminTokenValidator} for how ADMIN tokens are revoked).
 *
 * <p>ADMIN tokens differ from customer ones in two ways: a much shorter lifetime
 * ({@code app.security.admin-token-ttl-minutes}, 12 h by default, refreshed while the panel is in
 * use) and a {@code jti}, so a single token can be revoked on logout.
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final long ttlMinutes;
    private final long adminTtlMinutes;

    public JwtService(AppProperties props) {
        String secret = props.getSecurity().getJwtSecret();
        byte[] keyBytes = Base64.getDecoder().decode(secret);
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.ttlMinutes = props.getSecurity().getJwtAccessTtlMinutes();
        this.adminTtlMinutes = props.getSecurity().getAdminTokenTtlMinutes();
    }

    public long adminTtlMinutes() {
        return adminTtlMinutes;
    }

    public String issueToken(long telegramUserId, Role role) {
        return issueToken(telegramUserId, role, 0);
    }

    /**
     * Issues a token pinned to {@code tokenVersion} (admins: {@code admin_users.token_version}).
     * ADMIN tokens get the admin lifetime and a fresh {@code jti}.
     */
    public String issueToken(long telegramUserId, Role role, int tokenVersion) {
        Instant now = Instant.now();
        boolean admin = role == Role.ADMIN;
        Instant exp = now.plus(admin ? adminTtlMinutes : ttlMinutes, ChronoUnit.MINUTES);
        var builder = Jwts.builder()
                .subject(String.valueOf(telegramUserId))
                .claim("role", role.name())
                .claim("tv", tokenVersion)
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp));
        if (admin) {
            builder.id(UUID.randomUUID().toString());
        }
        return builder.signWith(key).compact();
    }

    /**
     * Short-lived CUSTOMER token for the public site, carried in the {@code access} cookie:
     * same format as the Mini App token plus {@code chn=web} and {@code sid} (the web session).
     */
    public String issueWebToken(long telegramUserId, String sessionId, long ttlMinutes) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(telegramUserId))
                .claim("role", Role.CUSTOMER.name())
                .claim("tv", 0)
                .claim("chn", AuthPrincipal.CHANNEL_WEB)
                .claim("sid", sessionId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttlMinutes, ChronoUnit.MINUTES)))
                .signWith(key)
                .compact();
    }

    /**
     * Validates signature + expiry and returns the parsed principal.
     *
     * @throws io.jsonwebtoken.JwtException if the token is invalid/expired
     */
    public AuthPrincipal parse(String token) {
        Jws<Claims> jws = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token);
        Claims claims = jws.getPayload();
        long telegramUserId = Long.parseLong(claims.getSubject());
        Role role = Role.valueOf(claims.get("role", String.class));
        Integer tokenVersion = claims.get("tv", Integer.class);
        Date exp = claims.getExpiration();
        return new AuthPrincipal(telegramUserId, role, tokenVersion == null ? 0 : tokenVersion,
                claims.get("chn", String.class), claims.get("sid", String.class),
                claims.getId(), exp == null ? null : exp.toInstant());
    }
}
