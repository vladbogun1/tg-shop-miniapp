package com.maxsolch.shop.adminauth;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

/**
 * The «first factor passed» token: proof that the password (or Telegram) check succeeded, valid for
 * {@value #TTL_MINUTES} minutes and good ONLY for the second step ({@code /api/auth/admin/2fa/*}).
 *
 * <p>Signed with its own HKDF-derived key ({@link AdminAuthKeys#preAuthKey()}), not the access-token
 * key, and typed {@code typ=admin-preauth}: {@code JwtService.parse} cannot accept it, so it never
 * authenticates a request, and {@code JwtAuthFilter} answers 403 when one is sent as a bearer token
 * outside the sign-in endpoints. It carries the admin's {@code token_version}, so «Выйти на всех
 * устройствах» / «Заблокировать» kill a half-finished sign-in too, and it is single-use: a
 * successful second step burns its {@code jti}.
 */
@Component
public class PreAuthTokens {

    public static final long TTL_MINUTES = 5;
    static final String TYPE = "admin-preauth";

    /** Why the second step is needed: the code from the app, or first-time 2FA setup. */
    public enum Stage { VERIFY, SETUP }

    public record PreAuth(long adminId, int tokenVersion, LoginMethod method, Stage stage, String jti,
                          Instant expiresAt) {
    }

    private final SecretKey key;
    private final Clock clock;
    private final Cache<String, Boolean> used = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofMinutes(TTL_MINUTES + 1))
            .build();

    public PreAuthTokens(AdminAuthKeys keys) {
        this(keys.preAuthKey(), Clock.systemUTC());
    }

    PreAuthTokens(byte[] key, Clock clock) {
        this.key = Keys.hmacShaKeyFor(key);
        this.clock = clock;
    }

    public String issue(long adminId, int tokenVersion, LoginMethod method, Stage stage) {
        Instant now = clock.instant();
        return Jwts.builder()
                .subject(String.valueOf(adminId))
                .claim("typ", TYPE)
                .claim("tv", tokenVersion)
                .claim("m", method.name())
                .claim("st", stage.name())
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(Duration.ofMinutes(TTL_MINUTES))))
                .signWith(key)
                .compact();
    }

    /** Valid, unexpired, not yet used — or empty. */
    public Optional<PreAuth> parse(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        try {
            Claims c = Jwts.parser().verifyWith(key).clock(() -> Date.from(clock.instant())).build()
                    .parseSignedClaims(token.trim()).getPayload();
            if (!TYPE.equals(c.get("typ", String.class)) || c.getId() == null) {
                return Optional.empty();
            }
            if (used.getIfPresent(c.getId()) != null) {
                return Optional.empty();
            }
            Integer tv = c.get("tv", Integer.class);
            return Optional.of(new PreAuth(Long.parseLong(c.getSubject()), tv == null ? 0 : tv,
                    LoginMethod.valueOf(c.get("m", String.class)), Stage.valueOf(c.get("st", String.class)),
                    c.getId(), c.getExpiration().toInstant()));
        } catch (JwtException | IllegalArgumentException | NullPointerException e) {
            return Optional.empty();
        }
    }

    /** True for any well-signed pre-auth token (expired or used ones included) — for the 403 in the filter. */
    public boolean looksLikePreAuth(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        try {
            Claims c = Jwts.parser().verifyWith(key).build().parseSignedClaims(token.trim()).getPayload();
            return TYPE.equals(c.get("typ", String.class));
        } catch (io.jsonwebtoken.ExpiredJwtException e) {
            return TYPE.equals(e.getClaims().get("typ", String.class));
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    /** Burns the token after a successful second step. */
    public void consume(PreAuth preAuth) {
        used.put(preAuth.jti(), Boolean.TRUE);
    }
}
