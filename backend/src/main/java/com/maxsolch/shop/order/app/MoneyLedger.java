package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel;
import com.maxsolch.shop.order.domain.OrderMoneyMovement.Kind;
import com.maxsolch.shop.order.domain.OrderMoneyMovement.Source;
import com.maxsolch.shop.order.infra.OrderMoneyMovementRepository;
import com.maxsolch.shop.order.domain.OrderErrors;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

/**
 * Writes the order money journal ({@link OrderMoneyMovement}). Called inside the transaction that
 * changes {@code received_minor} / {@code refunded_minor}, so a total never moves without its line.
 */
@Service
public class MoneyLedger {

    private final OrderMoneyMovementRepository repository;
    private final Clock clock;

    public MoneyLedger(OrderMoneyMovementRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public OrderMoneyMovement record(byte[] orderId, Kind kind, Channel channel, long amountMinor,
                                     Source source, String adminName, String note, String invoiceExtId) {
        OrderMoneyMovement m = new OrderMoneyMovement();
        m.setOrderId(orderId);
        m.setKind(kind.name());
        m.setChannel(channel.name());
        m.setAmountMinor(amountMinor);
        Instant now = clock.instant();
        m.setOccurredAt(now);
        m.setCreatedAt(now);
        m.setSource(source.name());
        m.setAdminName(cut(adminName, 255));
        m.setNote(cut(note, 500));
        m.setInvoiceExtId(cut(invoiceExtId, 64));
        return repository.save(m);
    }

    public List<OrderMoneyMovement> of(byte[] orderId) {
        return repository.findByOrderIdOrderByOccurredAtAscIdAsc(orderId);
    }

    /** Money the shop already kept on purpose (RETAINED rows): it can be neither kept again nor refunded. */
    public long retainedMinor(byte[] orderId) {
        return of(orderId).stream()
                .filter(m -> Kind.RETAINED.name().equals(m.getKind()))
                .mapToLong(OrderMoneyMovement::getAmountMinor)
                .sum();
    }

    /** The channel named in a request; blank or unknown is a 400 naming the allowed values. */
    public static Channel parseChannel(String value) {
        if (value == null || value.isBlank()) {
            throw OrderErrors.badRequest("укажите, как вернули деньги");
        }
        try {
            return Channel.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw OrderErrors.badRequest("неизвестный способ: " + value);
        }
    }

    /** The channel as the admin audit log words it. */
    public static String channelLabel(Channel c) {
        return switch (c) {
            case MONO -> "monobank";
            case NP_COD -> "наложка НП";
            case NP_PAYMENT_CONTROL -> "контроль оплаты НП";
            case CARD_TRANSFER -> "перевод на карту";
            case CASH -> "наличные";
            case NP_CLAIM -> "претензия НП";
            case OTHER -> "другое";
            case EXCHANGE -> "зачёт в обмен";
            case MERGE -> "перенос при объединении";
        };
    }

    private static String cut(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max - 1) + "…";
    }
}
