package com.maxsolch.shop.service;

import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.TooManyRequestsException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderGuardTest {

    static final Instant NOW = Instant.parse("2026-10-05T12:00:00Z");
    static final long USER = 42L;

    @Mock
    SettingsService settings;
    @Mock
    OrderGuardStore store;
    @Mock
    Messages messages;

    final Map<String, Integer> values = new HashMap<>();
    OrderGuard guard;

    @BeforeEach
    void setUp() {
        // Registry defaults: 2 unpaid, 60 s, 5/day, 5 per product, 20 units, 3 self-cancels.
        for (var d : SettingsRegistry.all()) {
            if (d.key().startsWith("antibot.")) {
                values.put(d.key(), Integer.parseInt(d.defaultValue()));
            }
        }
        lenient().when(settings.getInt(anyString())).thenAnswer(inv -> values.get(inv.<String>getArgument(0)));
        lenient().when(messages.current(anyString(), any(Object[].class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(store.productTitle(anyString())).thenReturn("Кепка");
        lenient().when(store.selfCancelsSince(anyLong(), any())).thenReturn(List.of());
        lenient().when(store.createdSince(anyLong(), any())).thenReturn(List.of());
        guard = new OrderGuard(settings, store, messages, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static List<CreateOrderCommand.Line> lines(int... qty) {
        List<CreateOrderCommand.Line> out = new java.util.ArrayList<>();
        for (int i = 0; i < qty.length; i++) {
            out.add(new CreateOrderCommand.Line("00000000-0000-0000-0000-00000000000" + i, null, qty[i]));
        }
        return out;
    }

    @Test
    void defaultsMatchTheDoc() {
        OrderGuard.Limits l = guard.limits();
        assertThat(l).isEqualTo(new OrderGuard.Limits(5, 20, 2, 60, 5, 3));
    }

    @Test
    void passesWithinAllLimits() {
        when(store.countUnpaid(USER)).thenReturn(1);
        when(store.createdSince(anyLong(), any())).thenReturn(List.of(NOW.minus(Duration.ofHours(2))));
        assertThatCode(() -> guard.check(USER, lines(5, 3))).doesNotThrowAnyException();
    }

    @Test
    void qtyPerProduct_countsDuplicateLinesTogether() {
        List<CreateOrderCommand.Line> l = List.of(
                new CreateOrderCommand.Line("00000000-0000-0000-0000-000000000001", null, 3),
                new CreateOrderCommand.Line("00000000-0000-0000-0000-000000000001", null, 3));
        assertThatThrownBy(() -> guard.check(USER, l))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((BadRequestException) e).getCode()).isEqualTo(OrderGuard.QTY_LIMIT));
        verify(store, never()).countUnpaid(anyLong());
    }

    @Test
    void unitsPerOrder() {
        assertThatThrownBy(() -> guard.check(USER, lines(5, 5, 5, 5, 1)))
                .isInstanceOf(BadRequestException.class)
                .hasMessage("api.antibot.unitsLimit");
    }

    @Test
    void tooManyUnpaid() {
        when(store.countUnpaid(USER)).thenReturn(2);
        assertThatThrownBy(() -> guard.check(USER, lines(1)))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((BadRequestException) e).getCode()).isEqualTo(OrderGuard.TOO_MANY_UNPAID));
    }

    @Test
    void cooldown_tellsHowLongToWait() {
        when(store.createdSince(anyLong(), any())).thenReturn(List.of(NOW.minusSeconds(20)));
        assertThatThrownBy(() -> guard.check(USER, lines(1)))
                .isInstanceOf(TooManyRequestsException.class)
                .satisfies(e -> {
                    TooManyRequestsException t = (TooManyRequestsException) e;
                    assertThat(t.getCode()).isEqualTo(OrderGuard.ORDER_COOLDOWN);
                    assertThat(t.getRetryAfterSeconds()).isEqualTo(40);
                });
    }

    @Test
    void dailyLimit_retryWhenOldestLeavesTheWindow() {
        List<Instant> five = List.of(NOW.minus(Duration.ofHours(20)), NOW.minus(Duration.ofHours(10)),
                NOW.minus(Duration.ofHours(5)), NOW.minus(Duration.ofHours(3)), NOW.minus(Duration.ofHours(1)));
        when(store.createdSince(anyLong(), any())).thenReturn(five);
        assertThatThrownBy(() -> guard.check(USER, lines(1)))
                .isInstanceOf(TooManyRequestsException.class)
                .satisfies(e -> {
                    TooManyRequestsException t = (TooManyRequestsException) e;
                    assertThat(t.getCode()).isEqualTo(OrderGuard.ORDER_DAILY_LIMIT);
                    assertThat(t.getRetryAfterSeconds()).isEqualTo(Duration.ofHours(4).toSeconds());
                });
    }

    @Test
    void selfCancelLimit() {
        when(store.selfCancelsSince(anyLong(), any())).thenReturn(List.of(
                NOW.minus(Duration.ofHours(6)), NOW.minus(Duration.ofHours(2)), NOW.minus(Duration.ofHours(1))));
        assertThatThrownBy(() -> guard.check(USER, lines(1)))
                .isInstanceOf(TooManyRequestsException.class)
                .satisfies(e -> {
                    TooManyRequestsException t = (TooManyRequestsException) e;
                    assertThat(t.getCode()).isEqualTo(OrderGuard.CANCEL_LIMIT);
                    assertThat(t.getRetryAfterSeconds()).isEqualTo(Duration.ofHours(18).toSeconds());
                });
    }

    @Test
    void zeroTurnsEveryLimitOff() {
        values.replaceAll((k, v) -> 0);
        assertThatCode(() -> guard.check(USER, lines(500, 500))).doesNotThrowAnyException();
        verify(store, never()).countUnpaid(anyLong());
        verify(store, never()).createdSince(anyLong(), any());
        verify(store, never()).selfCancelsSince(anyLong(), any());
    }
}
