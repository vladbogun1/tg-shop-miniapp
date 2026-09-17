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

/**
 * Issues and validates HS256 JWTs. Subject = telegram user id, custom claims {@code role} and
 * {@code tv} (token version — see {@link AdminTokenValidator} for how ADMIN tokens are revoked).
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final long ttlMinutes;

    public JwtService(AppProperties props) {
        String secret = props.getSecurity().getJwtSecret();
        byte[] keyBytes = Base64.getDecoder().decode(secret);
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.ttlMinutes = props.getSecurity().getJwtAccessTtlMinutes();
    }

    public String issueToken(long telegramUserId, Role role) {
        return issueToken(telegramUserId, role, 0);
    }

    /** Issues a token pinned to {@code tokenVersion} (admins: {@code admin_users.token_version}). */
    public String issueToken(long telegramUserId, Role role, int tokenVersion) {
        Instant now = Instant.now();
        Instant exp = now.plus(ttlMinutes, ChronoUnit.MINUTES);
        return Jwts.builder()
                .subject(String.valueOf(telegramUserId))
                .claim("role", role.name())
                .claim("tv", tokenVersion)
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
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
        return new AuthPrincipal(telegramUserId, role, tokenVersion == null ? 0 : tokenVersion);
    }
}
