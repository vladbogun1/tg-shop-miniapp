package com.maxsolch.shop.geo;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VisitorLocationServiceTest {

    @Mock
    JdbcTemplate jdbc;
    @Mock
    GeoIpLookup geo;

    /** Runs the background write inline so the test can see it. */
    private VisitorLocationService service(boolean enabled) {
        lenient().when(geo.lookup(anyString())).thenReturn(Optional.empty());
        return new VisitorLocationService(jdbc, geo, enabled, Duration.ofMinutes(15), Runnable::run);
    }

    @Test
    void writesOncePerThrottleWindow() {
        VisitorLocationService s = service(true);
        s.touchUser(42L, VisitorLocationService.MINIAPP, "8.8.8.8");
        s.touchUser(42L, VisitorLocationService.MINIAPP, "8.8.4.4");
        s.touchUser(43L, VisitorLocationService.WEB, "8.8.8.8");

        verify(jdbc).update(contains("INSERT INTO visitor_locations"), eq("tg:42"), eq(42L), any(),
                eq("MINIAPP"), eq("8.8.8.8"), any(), any(), any(), any(), any());
        verify(jdbc).update(contains("INSERT INTO visitor_locations"), eq("tg:43"), eq(43L), any(),
                eq("WEB"), eq("8.8.8.8"), any(), any(), any(), any(), any());
        verify(jdbc, never()).update(contains("INSERT INTO visitor_locations"), eq("tg:42"), any(), any(),
                any(), eq("8.8.4.4"), any(), any(), any(), any(), any());
    }

    @Test
    void anonymousSiteVisitor_keyedByBrowserId_badIdIgnored() {
        VisitorLocationService s = service(true);
        s.touchWeb(null, "anon-1234567", "1.1.1.1");
        s.touchWeb(null, "bad id!", "1.1.1.1");
        s.touchWeb(null, null, "1.1.1.1");

        verify(jdbc, times(1)).update(contains("INSERT INTO visitor_locations"), eq("anon:anon-1234567"),
                any(), eq("anon-1234567"), eq("WEB"), eq("1.1.1.1"), any(), any(), any(), any(), any());
    }

    @Test
    void signedInSiteVisitor_replacesTheirAnonymousRow() {
        VisitorLocationService s = service(true);
        s.touchWeb(7L, "anon-1234567", "1.1.1.1");

        verify(jdbc).update(contains("INSERT INTO visitor_locations"), eq("tg:7"), eq(7L), any(),
                eq("WEB"), eq("1.1.1.1"), any(), any(), any(), any(), any());
        verify(jdbc).update(contains("DELETE FROM visitor_locations"), eq("anon:anon-1234567"));
    }

    @Test
    void disabledOrUnknownIp_writesNothing() {
        service(false).touchUser(1L, VisitorLocationService.MINIAPP, "8.8.8.8");
        service(true).touchUser(1L, VisitorLocationService.MINIAPP, "unknown");
        verifyNoInteractions(jdbc);
    }

    @Test
    void databaseFailure_neverReachesTheCaller_andIsRetriedNextTime() {
        VisitorLocationService s = service(true);
        when(jdbc.update(anyString(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new RuntimeException("db down"));

        assertThatCode(() -> s.touchUser(5L, VisitorLocationService.MINIAPP, "8.8.8.8")).doesNotThrowAnyException();
        assertThatCode(() -> s.touchUser(5L, VisitorLocationService.MINIAPP, "8.8.8.8")).doesNotThrowAnyException();
        verify(jdbc, times(2)).update(anyString(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }
}
