package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.customer.domain.CustomerError;
import com.maxsolch.shop.customer.domain.CustomerFlag;
import com.maxsolch.shop.customer.infra.CustomerFlagRepository;
import com.maxsolch.shop.customer.infra.UserRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Optional;

/** The admin puts the «проблемный покупатель» mark on a customer (with the reason) or takes it off. */
@Service
public class CustomerFlagging {

    static final int MAX_REASON = 500;

    private final CustomerFlagRepository flags;
    private final UserRepository users;
    private final CustomerFlags read;
    private final AdminAuditService audit;
    private final CurrentActor actor;
    private final Clock clock;

    public CustomerFlagging(CustomerFlagRepository flags, UserRepository users, CustomerFlags read,
                            AdminAuditService audit, CurrentActor actor, Clock clock) {
        this.flags = flags;
        this.users = users;
        this.read = read;
        this.audit = audit;
        this.actor = actor;
        this.clock = clock;
    }

    /** Puts the mark on, or changes its reason; the date stays the first one. */
    @Transactional
    public CustomerFlags.Flag flag(long telegramUserId, String reason) {
        String text = reason == null ? "" : reason.trim();
        if (text.isEmpty()) {
            throw new DomainException.BadRequest(CustomerError.FLAG_REASON_REQUIRED);
        }
        if (text.length() > MAX_REASON) {
            throw new DomainException.BadRequest(CustomerError.FLAG_REASON_TOO_LONG);
        }
        if (!users.existsById(telegramUserId)) {
            throw new DomainException.NotFound(CustomerError.CUSTOMER_NOT_FOUND);
        }
        CustomerFlag row = flags.findById(telegramUserId).orElseGet(() -> {
            CustomerFlag f = new CustomerFlag();
            f.setTelegramUserId(telegramUserId);
            f.setFlaggedAt(clock.instant());
            f.setFlaggedByAdminId(actor.userId());
            return f;
        });
        boolean changed = row.getReason() != null;
        row.setReason(text);
        flags.save(row);
        audit.record(changed ? "CUSTOMER_FLAG_EDIT" : "CUSTOMER_FLAG", "USER", String.valueOf(telegramUserId),
                (changed ? "проблемный покупатель, новая причина: " : "отмечен проблемным: ") + text);
        return new CustomerFlags.Flag(telegramUserId, text, row.getFlaggedAt());
    }

    /** Takes the mark off; nothing happens when there was none. */
    @Transactional
    public void clear(long telegramUserId) {
        Optional<CustomerFlags.Flag> was = read.of(telegramUserId);
        if (was.isEmpty()) {
            return;
        }
        flags.deleteById(telegramUserId);
        audit.record("CUSTOMER_UNFLAG", "USER", String.valueOf(telegramUserId),
                "метка «проблемный» снята (была: " + was.get().reason() + ")");
    }
}
