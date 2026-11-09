package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.domain.CustomerFlag;
import com.maxsolch.shop.customer.infra.CustomerFlagRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * What the other modules may ask about the «проблемный покупатель» mark: is it on, and why. Checkout refuses a
 * prepayment (the rest cash on delivery) to a marked buyer; the admin order view and the Telegram card show the reason.
 */
@Service
public class CustomerFlags {

    /** The mark as the admin set it. */
    public record Flag(long telegramUserId, String reason, Instant flaggedAt) {
    }

    private final CustomerFlagRepository flags;

    public CustomerFlags(CustomerFlagRepository flags) {
        this.flags = flags;
    }

    @Transactional(readOnly = true)
    public Optional<Flag> of(Long telegramUserId) {
        if (telegramUserId == null) {
            return Optional.empty();
        }
        return flags.findById(telegramUserId).map(CustomerFlags::toFlag);
    }

    /** The marks of these customers, keyed by Telegram id; the unmarked ones are absent. */
    @Transactional(readOnly = true)
    public Map<Long, Flag> ofAll(Collection<Long> telegramUserIds) {
        if (telegramUserIds.isEmpty()) {
            return Map.of();
        }
        return flags.findAllById(telegramUserIds).stream()
                .map(CustomerFlags::toFlag)
                .collect(Collectors.toMap(Flag::telegramUserId, Function.identity()));
    }

    /** Only full online payment for this buyer: no prepayment with the rest cash on delivery. */
    public boolean onlinePaymentOnly(Long telegramUserId) {
        return of(telegramUserId).isPresent();
    }

    private static Flag toFlag(CustomerFlag f) {
        return new Flag(f.getTelegramUserId(), f.getReason(), f.getFlaggedAt());
    }
}
