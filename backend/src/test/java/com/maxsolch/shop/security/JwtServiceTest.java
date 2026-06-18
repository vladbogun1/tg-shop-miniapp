package com.maxsolch.shop.security;

import com.maxsolch.shop.config.AppProperties;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    // 32 bytes -> valid HS256 key.
    private static final String SECRET =
            Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef".getBytes());

    private AppProperties props(long ttlMinutes) {
        AppProperties p = new AppProperties();
        p.getSecurity().setJwtSecret(SECRET);
        p.getSecurity().setJwtAccessTtlMinutes(ttlMinutes);
        return p;
    }

    private JwtService service;

    @BeforeEach
    void setUp() {
        service = new JwtService(props(120));
    }

    @Test
    void issueThenParse_returnsSameSubjectAndRole() {
        String token = service.issueToken(987654321L, Role.ADMIN);

        AuthPrincipal principal = service.parse(token);

        assertThat(principal.telegramUserId()).isEqualTo(987654321L);
        assertThat(principal.role()).isEqualTo(Role.ADMIN);
    }

    @Test
    void issueThenParse_customerRole() {
        String token = service.issueToken(42L, Role.CUSTOMER);

        AuthPrincipal principal = service.parse(token);

        assertThat(principal.telegramUserId()).isEqualTo(42L);
        assertThat(principal.role()).isEqualTo(Role.CUSTOMER);
    }

    @Test
    void parse_tamperedToken_isRejected() {
        String token = service.issueToken(1L, Role.ADMIN);
        // Flip a character in the signature segment.
        String tampered = token.substring(0, token.length() - 2)
                + (token.endsWith("A") ? "B" : "A");

        assertThatThrownBy(() -> service.parse(tampered))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void parse_tokenSignedWithDifferentKey_isRejected() {
        String otherSecret = Base64.getEncoder()
                .encodeToString("ffffffffffffffffffffffffffffffff".getBytes());
        AppProperties other = new AppProperties();
        other.getSecurity().setJwtSecret(otherSecret);
        JwtService otherService = new JwtService(other);

        String foreignToken = otherService.issueToken(5L, Role.ADMIN);

        assertThatThrownBy(() -> service.parse(foreignToken))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void parse_expiredToken_isRejected() {
        JwtService shortLived = new JwtService(props(-1)); // already expired
        String token = shortLived.issueToken(1L, Role.ADMIN);

        assertThatThrownBy(() -> shortLived.parse(token))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void parse_garbageToken_isRejected() {
        assertThatThrownBy(() -> service.parse("not.a.jwt"))
                .isInstanceOf(JwtException.class);
    }
}
