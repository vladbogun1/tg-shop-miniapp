package com.maxsolch.shop.support.app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.media.app.MediaSigner;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.support.app.SupportDtos.StartThreadRequest;
import com.maxsolch.shop.support.app.SupportDtos.ThreadDto;
import com.maxsolch.shop.support.domain.SupportError;
import com.maxsolch.shop.support.domain.SupportMessage;
import com.maxsolch.shop.support.domain.SupportStatus;
import com.maxsolch.shop.support.domain.SupportThread;
import com.maxsolch.shop.support.infra.SupportMessageRepository;
import com.maxsolch.shop.support.infra.SupportThreadRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** «Админ пишет первым»: a new thread with the admin's message, none of the customer's limits. */
class AdminThreadStarterTest {

    private static final Instant NOW = Instant.parse("2026-11-01T12:00:00Z");
    private static final long CUSTOMER = 42L;

    private SupportThreadRepository threads;
    private SupportMessageRepository messageRepository;
    private Customers customers;
    private DomainEvents events;
    private AdminAuditService audit;
    private AdminThreadStarter starter;
    private final AtomicLong ids = new AtomicLong();

    @BeforeEach
    void setUp() {
        threads = mock(SupportThreadRepository.class);
        messageRepository = mock(SupportMessageRepository.class);
        customers = mock(Customers.class);
        events = mock(DomainEvents.class);
        audit = mock(AdminAuditService.class);
        SettingsService settings = mock(SettingsService.class);
        when(settings.getInt(SupportSettings.SUPPORT_MAX_LENGTH)).thenReturn(2000);
        SupportMapper mapper = new SupportMapper(mock(MediaSigner.class), mock(Messages.class));
        CurrentActor actor = mock(CurrentActor.class);
        when(actor.userId()).thenReturn(7L);
        when(audit.currentAdminName()).thenReturn("Админ");
        when(threads.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(threads.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(messageRepository.saveAndFlush(any())).thenAnswer(inv -> {
            SupportMessage m = inv.getArgument(0);
            m.setId(ids.incrementAndGet());
            return m;
        });
        when(customers.findById(anyLong())).thenReturn(Optional.empty());
        starter = new AdminThreadStarter(threads, new SupportPosts(threads, messageRepository, customers, mapper, events),
                new SupportLimits(settings, threads, messageRepository, mock(Messages.class)), mapper, audit, actor,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void opensAThreadWithTheAdminMessageAndNotifiesTheCustomer() {
        User u = new User();
        u.setFirstName("Оля");
        when(customers.findById(CUSTOMER)).thenReturn(Optional.of(u));

        ThreadDto t = starter.start(new StartThreadRequest(CUSTOMER, "  Приз  ", "Вітаємо!"));

        ArgumentCaptor<SupportThread> saved = ArgumentCaptor.forClass(SupportThread.class);
        verify(threads).saveAndFlush(saved.capture());
        SupportThread row = saved.getValue();
        assertThat(row.getUserId()).isEqualTo(CUSTOMER);
        assertThat(row.getStatus()).isEqualTo(SupportStatus.OPEN);
        assertThat(row.getSubject()).isEqualTo("Приз");
        assertThat(row.getCustomerName()).isEqualTo("Оля");
        assertThat(row.getLastSender()).isEqualTo(SenderType.ADMIN);
        assertThat(row.getCustomerUnread()).isEqualTo(1);
        assertThat(t.status()).isEqualTo("OPEN");
        verify(events, org.mockito.Mockito.times(2)).publish(any());
        verify(audit).record(org.mockito.ArgumentMatchers.eq("support.start"), any(), any(), any());
    }

    @Test
    void unknownCustomerIsRefused() {
        assertThatThrownBy(() -> starter.start(new StartThreadRequest(999L, null, "Привіт")))
                .isInstanceOf(DomainException.NotFound.class)
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(SupportError.CUSTOMER_NOT_FOUND);
        verify(threads, never()).saveAndFlush(any());
    }

    @Test
    void emptyMessageIsRefused() {
        assertThatThrownBy(() -> starter.start(new StartThreadRequest(CUSTOMER, null, "  ")))
                .isInstanceOf(DomainException.BadRequest.class);
        verify(threads, never()).saveAndFlush(any());
    }
}
