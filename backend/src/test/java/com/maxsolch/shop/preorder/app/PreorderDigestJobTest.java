package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.preorder.infra.PreorderProperties;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.procurement.app.LineProducts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The daily «Чего ждут» digest: top 3, silent when nothing is new, nothing configured or already sent today. */
class PreorderDigestJobTest {

    static final Instant NOW = Instant.parse("2026-10-27T07:00:00Z"); // 10:00 in Kyiv
    final PreorderSubscriptionRepository subs = mock(PreorderSubscriptionRepository.class);
    final LineProducts queue = mock(LineProducts.class);
    final SettingsService settings = mock(SettingsService.class);
    final PreorderDigestNotifier seller = mock(PreorderDigestNotifier.class);
    final PreorderProperties props = new PreorderProperties();
    PreorderDigestJob job;
    final byte[][] ids = {UuidUtil.randomBytes(), UuidUtil.randomBytes(), UuidUtil.randomBytes(), UuidUtil.randomBytes()};

    @BeforeEach
    void setUp() {
        props.getTelegram().setBotToken("token");
        props.getTelegram().setNotifyChatId("-100500");
        job = new PreorderDigestJob(subs, queue, settings, props, seller, Clock.fixed(NOW, ZoneOffset.UTC),
                new com.maxsolch.shop.platform.time.ShopZone("Europe/Kyiv"));
        when(settings.system(PreorderDigestJob.DAY_KEY)).thenReturn(Optional.empty());
        when(subs.joinedBetween(any(), any())).thenReturn(List.<Object[]>of(new Object[]{7L, 5L}));
        when(subs.joinedByProduct(any(), any())).thenReturn(List.of(
                new Object[]{ids[0], 3L}, new Object[]{ids[1], 2L}, new Object[]{ids[2], 1L}, new Object[]{ids[3], 1L}));
        when(queue.productsOf(any())).thenAnswer(inv -> {
            Map<String, Product> m = new HashMap<>();
            String[] titles = {"Lamzu <Maya>", "Razer", "Logitech", "Fourth"};
            for (int i = 0; i < 4; i++) {
                Product p = new Product();
                p.setId(ids[i]);
                p.setTitle(titles[i]);
                m.put(UuidUtil.toString(ids[i]), p);
            }
            return m;
        });
    }

    @Test
    void sendsTheTopThreeAndRemembersTheDay() throws Exception {
        assertThat(job.send()).isTrue();

        verify(settings).putSystem(PreorderDigestJob.DAY_KEY, "2026-10-27");
        verify(seller).deliver(eq("-100500"), any());
        String text = job.text(NOW.minusSeconds(86400), NOW);
        assertThat(text).contains("+7 подписок").contains("5 чел.")
                .contains("<b>Lamzu &lt;Maya&gt;</b> (+3)").contains("Razer").contains("Logitech")
                .doesNotContain("Fourth");
    }

    @Test
    void staysSilentWhenNobodyJoined() throws Exception {
        when(subs.joinedBetween(any(), any())).thenReturn(List.<Object[]>of(new Object[]{0L, 0L}));

        assertThat(job.send()).isFalse();

        verify(settings, never()).putSystem(anyString(), anyString());
        verify(seller, never()).deliver(any(), any());
    }

    @Test
    void staysSilentWithoutTokenOrChat() throws Exception {
        props.getTelegram().setBotToken("");
        assertThat(job.send()).isFalse();
        props.getTelegram().setBotToken("token");
        props.getTelegram().setNotifyChatId("0");
        assertThat(job.send()).isFalse();
        props.getTelegram().setNotifyChatId(null);
        assertThat(job.send()).isFalse();

        verify(seller, never()).deliver(any(), any());
    }

    @Test
    void doesNotSendTwiceInADay() throws Exception {
        when(settings.system(PreorderDigestJob.DAY_KEY)).thenReturn(Optional.of("2026-10-27"));

        assertThat(job.send()).isFalse();

        verify(seller, never()).deliver(any(), any());
    }

    @Test
    void pluralisesTheCounter() {
        when(subs.joinedBetween(any(), any())).thenReturn(List.<Object[]>of(new Object[]{1L, 1L}));
        assertThat(job.text(NOW.minusSeconds(86400), NOW)).contains("+1 подписка");
        when(subs.joinedBetween(any(), any())).thenReturn(List.<Object[]>of(new Object[]{22L, 9L}));
        assertThat(job.text(NOW.minusSeconds(86400), NOW)).contains("+22 подписки");
    }
}
