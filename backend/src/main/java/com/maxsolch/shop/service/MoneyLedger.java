package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.OrderMoneyMovement;
import com.maxsolch.shop.domain.OrderMoneyMovement.Channel;
import com.maxsolch.shop.domain.OrderMoneyMovement.Kind;
import com.maxsolch.shop.domain.OrderMoneyMovement.Source;
import com.maxsolch.shop.repository.OrderMoneyMovementRepository;
import com.maxsolch.shop.platform.error.BadRequestException;
import org.springframework.stereotype.Service;

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

    public MoneyLedger(OrderMoneyMovementRepository repository) {
        this.repository = repository;
    }

    public OrderMoneyMovement record(byte[] orderId, Kind kind, Channel channel, long amountMinor,
                                     Source source, String adminName, String note, String invoiceExtId) {
        OrderMoneyMovement m = new OrderMoneyMovement();
        m.setOrderId(orderId);
        m.setKind(kind.name());
        m.setChannel(channel.name());
        m.setAmountMinor(amountMinor);
        m.setOccurredAt(Instant.now());
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
            throw new BadRequestException("укажите, как вернули деньги");
        }
        try {
            return Channel.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("неизвестный способ: " + value);
        }
    }

    private static String cut(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max - 1) + "…";
    }
}
