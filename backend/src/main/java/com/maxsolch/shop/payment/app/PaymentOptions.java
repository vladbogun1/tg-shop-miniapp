package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.domain.PaymentErrors;
import com.maxsolch.shop.payment.domain.PaymentOption;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.site.SiteRevalidator;
import jakarta.validation.Validator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The payment options of the checkout ({@code payment_options}): what the customer sees and what the admin edits.
 * Options are never deleted — a switched-off one stays so historical orders keep a valid {@code payment_option_id}.
 */
@Service
public class PaymentOptions {

    private final PaymentOptionRepository repository;
    private final AdminAuditService audit;
    private final SiteRevalidator siteRevalidator;
    private final Validator validator;

    public PaymentOptions(PaymentOptionRepository repository, AdminAuditService audit,
                          SiteRevalidator siteRevalidator, Validator validator) {
        this.repository = repository;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
        this.validator = validator;
    }

    /**
     * Active options in checkout order as the customer sees them (untranslated: the public endpoint overlays the
     * uk/en texts, which keeps this module free of the translation package until that one is migrated).
     */
    public List<PaymentOptionDto> active() {
        return repository.findByActiveTrueOrderBySortOrderAsc().stream()
                .map(p -> new PaymentOptionDto(
                        UuidUtil.toString(p.getId()),
                        p.getTitle(),
                        p.getDescription(),
                        p.isRequiresPrepayment(),
                        p.getPrepaymentMinor()))
                .toList();
    }

    /**
     * The options the editor works with, in checkout order. {@code includeInactive} also returns the switched-off
     * ones (the editor shows them so they can be switched back on).
     */
    public List<AdminPaymentOptionDto> forAdmin(boolean includeInactive) {
        List<PaymentOption> list = includeInactive
                ? repository.findAllByOrderBySortOrderAsc()
                : repository.findByActiveTrueOrderBySortOrderAsc();
        return list.stream().map(this::toDto).toList();
    }

    /**
     * Saves the list of payment options as an upsert + soft delete. The list order is the checkout
     * order; {@code active=false} hides an option without losing it.
     *
     * <p>It used to {@code deleteAll()} and re-insert. Orders reference {@code payment_option_id}
     * with {@code ON DELETE SET NULL}, so every save quietly detached the payment option from all
     * historical orders — and a customer checking out during that window got "unknown payment
     * option". Now surviving rows are updated in place, and options that disappear from the list
     * are merely deactivated so existing orders keep pointing at something real.
     *
     * <p>A list without a single active option is refused: it would stop checkout outright (A7 —
     * the editor used to send an empty list when its own load had failed).
     */
    @Transactional
    public List<AdminPaymentOptionDto> replace(List<AdminPaymentOptionDto> body) {
        List<AdminPaymentOptionDto> incoming = body == null ? List.of() : body;
        long activeCount = incoming.stream().filter(d -> d.active() == null || d.active()).count();
        if (activeCount == 0) {
            throw PaymentErrors.badRequest(
                    "Нельзя выключить все способы оплаты — покупатели не смогут оформить заказ");
        }
        for (AdminPaymentOptionDto dto : incoming) {
            // A JSON array body is not cascaded into by @Valid, so the elements are checked by hand:
            // an overlong title used to reach the database and come back as a vague "save failed".
            validator.validate(dto).stream().findFirst().ifPresent(v -> {
                throw PaymentErrors.badRequest(v.getPropertyPath() + ": " + v.getMessage());
            });
            if (dto.title() == null || dto.title().isBlank()) {
                throw PaymentErrors.badRequest("У каждого способа оплаты должно быть название");
            }
            if (dto.prepaymentMinor() < 0) {
                throw PaymentErrors.badRequest("Предоплата не может быть отрицательной");
            }
        }

        Map<String, PaymentOption> existing = new LinkedHashMap<>();
        for (PaymentOption po : repository.findAllByOrderBySortOrderAsc()) {
            existing.put(UuidUtil.toString(po.getId()), po);
        }

        List<String> changes = new ArrayList<>();
        Set<String> keptIds = new HashSet<>();
        int order = 0;
        for (AdminPaymentOptionDto dto : incoming) {
            PaymentOption po = null;
            if (dto.id() != null && !dto.id().isBlank()) {
                po = existing.get(dto.id().trim());
            }
            boolean active = dto.active() == null || dto.active();
            if (po == null) {
                po = new PaymentOption();
                changes.add("добавлен «" + dto.title().trim() + "»");
            } else if (po.isActive() != active) {
                changes.add((active ? "включён «" : "выключен «") + dto.title().trim() + "»");
            }
            po.setTitle(dto.title().trim());
            po.setDescription(dto.description());
            po.setRequiresPrepayment(dto.requiresPrepayment());
            po.setPrepaymentMinor(dto.prepaymentMinor());
            // The list order IS the checkout order (the editor has up/down buttons).
            po.setSortOrder(order++);
            po.setActive(active);
            PaymentOption saved = repository.save(po);
            keptIds.add(UuidUtil.toString(saved.getId()));
        }

        // Removed from the list → hide it from checkout, but keep the row for old orders.
        for (Map.Entry<String, PaymentOption> entry : existing.entrySet()) {
            if (!keptIds.contains(entry.getKey()) && entry.getValue().isActive()) {
                entry.getValue().setActive(false);
                repository.save(entry.getValue());
                changes.add("убран «" + entry.getValue().getTitle() + "»");
            }
        }
        audit.record("PAYMENT_OPTIONS", "PAYMENT", null,
                "активных: " + activeCount + " из " + incoming.size()
                        + (changes.isEmpty() ? "" : "; " + String.join(", ", changes)));
        // The site's checkout caches the list under the "payment-options" data tag (after commit).
        siteRevalidator.paymentChanged();
        return forAdmin(true);
    }

    /** An option that is still on offer; empty for an unknown or switched-off one. */
    public Optional<PaymentOption> findActive(byte[] id) {
        return repository.findById(id).filter(PaymentOption::isActive);
    }

    private AdminPaymentOptionDto toDto(PaymentOption p) {
        return new AdminPaymentOptionDto(
                UuidUtil.toString(p.getId()),
                p.getTitle(),
                p.getDescription(),
                p.isRequiresPrepayment(),
                p.getPrepaymentMinor(),
                p.getSortOrder(),
                p.isActive());
    }
}
