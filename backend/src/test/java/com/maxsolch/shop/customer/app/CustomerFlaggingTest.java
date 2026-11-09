package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.customer.domain.CustomerError;
import com.maxsolch.shop.customer.domain.CustomerFlag;
import com.maxsolch.shop.customer.infra.CustomerFlagRepository;
import com.maxsolch.shop.customer.infra.UserRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The admin marks a buyer «проблемный» (reason required, ≤ 500), edits the reason, takes the mark off. */
class CustomerFlaggingTest {

    private static final Instant NOW = Instant.parse("2026-11-09T12:00:00Z");

    private final CustomerFlagRepository repo = mock(CustomerFlagRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final AdminAuditService audit = mock(AdminAuditService.class);
    private final CurrentActor actor = mock(CurrentActor.class);
    private final CustomerFlagging flagging = new CustomerFlagging(repo, users, new CustomerFlags(repo), audit, actor,
            Clock.fixed(NOW, ZoneOffset.UTC));

    {
        when(actor.userId()).thenReturn(3L);
        when(users.existsById(7L)).thenReturn(true);
    }

    @Test
    void flag_newMark_savesReasonAdminAndDate_andAudits() {
        when(repo.findById(7L)).thenReturn(Optional.empty());

        CustomerFlags.Flag f = flagging.flag(7L, "  не забрал наложку 1800 ₴  ");

        ArgumentCaptor<CustomerFlag> saved = ArgumentCaptor.forClass(CustomerFlag.class);
        verify(repo).save(saved.capture());
        assertThat(saved.getValue().getReason()).isEqualTo("не забрал наложку 1800 ₴");
        assertThat(saved.getValue().getFlaggedAt()).isEqualTo(NOW);
        assertThat(saved.getValue().getFlaggedByAdminId()).isEqualTo(3L);
        assertThat(f.reason()).isEqualTo("не забрал наложку 1800 ₴");
        verify(audit).record(eq("CUSTOMER_FLAG"), eq("USER"), eq("7"), anyString());
    }

    @Test
    void flag_existingMark_keepsFirstDate_changesReason() {
        CustomerFlag row = new CustomerFlag();
        row.setTelegramUserId(7L);
        row.setReason("старое");
        row.setFlaggedAt(Instant.parse("2026-11-01T00:00:00Z"));
        when(repo.findById(7L)).thenReturn(Optional.of(row));

        CustomerFlags.Flag f = flagging.flag(7L, "новое");

        assertThat(f.flaggedAt()).isEqualTo(Instant.parse("2026-11-01T00:00:00Z"));
        assertThat(row.getReason()).isEqualTo("новое");
        verify(audit).record(eq("CUSTOMER_FLAG_EDIT"), eq("USER"), eq("7"), anyString());
    }

    @Test
    void flag_blankOrTooLongReason_orUnknownCustomer_refused() {
        assertThatThrownBy(() -> flagging.flag(7L, "   ")).isInstanceOf(DomainException.BadRequest.class)
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(CustomerError.FLAG_REASON_REQUIRED);
        assertThatThrownBy(() -> flagging.flag(7L, "x".repeat(501))).isInstanceOf(DomainException.BadRequest.class)
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(CustomerError.FLAG_REASON_TOO_LONG);
        assertThatThrownBy(() -> flagging.flag(8L, "кинул")).isInstanceOf(DomainException.NotFound.class);
        verify(repo, never()).save(any());
    }

    @Test
    void clear_deletesAndAudits_onlyWhenMarked() {
        CustomerFlag row = new CustomerFlag();
        row.setTelegramUserId(7L);
        row.setReason("кинул");
        row.setFlaggedAt(NOW);
        when(repo.findById(7L)).thenReturn(Optional.of(row));
        when(repo.findById(8L)).thenReturn(Optional.empty());

        flagging.clear(7L);
        flagging.clear(8L);

        verify(repo).deleteById(7L);
        verify(repo, never()).deleteById(8L);
        verify(audit).record(eq("CUSTOMER_UNFLAG"), eq("USER"), eq("7"), anyString());
    }
}
