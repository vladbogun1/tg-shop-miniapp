package com.maxsolch.shop.platform.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The guard exists because one forgotten flag ({@code ALLOW_UNSIGNED_INIT_DATA}) turns the API
 * into an open admin-token dispenser. These tests pin the rule: tolerated under dev, fatal
 * everywhere else.
 */
class StartupSecurityCheckTest {

    private static final String PLACEHOLDER_SECRET =
            "Y2hhbmdlLW1lLWJhc2U2NC0yNTZiaXQtc2VjcmV0LWZvci1qd3Qtc2lnbmluZw==";
    private static final String REAL_SECRET = "c29tZS1yZWFsbHktbG9uZy1zZWNyZXQtdmFsdWUtaGVyZQ==";

    private AppProperties props(boolean allowUnsigned, String jwtSecret) {
        AppProperties p = new AppProperties();
        p.getTelegram().setAllowUnsignedInitData(allowUnsigned);
        p.getSecurity().setJwtSecret(jwtSecret);
        return p;
    }

    private MockEnvironment env(String... profiles) {
        MockEnvironment e = new MockEnvironment();
        e.setActiveProfiles(profiles);
        return e;
    }

    @Test
    void unsignedInitDataOutsideDev_refusesToStart() {
        StartupSecurityCheck check = new StartupSecurityCheck(
                props(true, REAL_SECRET), env("prod"), List.of());

        assertThatThrownBy(check::verify)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ALLOW_UNSIGNED_INIT_DATA");
    }

    @Test
    void noProfileAtAllIsTreatedAsProduction() {
        // The server runs without an explicit profile, so "no profile" must NOT mean "dev".
        StartupSecurityCheck check = new StartupSecurityCheck(
                props(true, REAL_SECRET), env(), List.of());

        assertThatThrownBy(check::verify).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void unsignedInitDataUnderDev_isAllowed() {
        StartupSecurityCheck check = new StartupSecurityCheck(
                props(true, PLACEHOLDER_SECRET), env("dev"), List.of());

        assertThatCode(check::verify).doesNotThrowAnyException();
    }

    @Test
    void placeholderJwtSecretOutsideDev_refusesToStart() {
        StartupSecurityCheck check = new StartupSecurityCheck(
                props(false, PLACEHOLDER_SECRET), env("prod"), List.of());

        assertThatThrownBy(check::verify)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET");
    }

    @Test
    void allProblemsAreReportedTogether() {
        StartupSecurityCheck check = new StartupSecurityCheck(
                props(true, PLACEHOLDER_SECRET), env("prod"),
                List.of((dev, fatal) -> fatal.add("ADMIN_PASSWORD из модуля")));

        assertThatThrownBy(check::verify)
                .isInstanceOf(IllegalStateException.class)
                .satisfies(e -> assertThat(e.getMessage())
                        .contains("ALLOW_UNSIGNED_INIT_DATA")
                        .contains("JWT_SECRET")
                        .contains("ADMIN_PASSWORD"));
    }

    @Test
    void properlyConfiguredProduction_starts() {
        StartupSecurityCheck check = new StartupSecurityCheck(
                props(false, REAL_SECRET), env("prod"), List.of());

        assertThatCode(check::verify).doesNotThrowAnyException();
    }
}
