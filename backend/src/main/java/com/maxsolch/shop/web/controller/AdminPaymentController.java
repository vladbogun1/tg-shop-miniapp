package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.PaymentRequisites;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.PaymentRequisitesRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.PaymentRequisitesRules;
import com.maxsolch.shop.tg.NotificationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.dto.AdminPaymentOptionDto;
import com.maxsolch.shop.web.dto.PaymentRequisitesDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/admin")
@RequiredAdmin
@Tag(name = "Admin Payment", description = "Admin payment options and requisites")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPaymentController {

    private final PaymentOptionRepository paymentOptionRepository;
    private final PaymentRequisitesRepository requisitesRepository;
    private final AdminAuditService audit;
    private final NotificationService notificationService;

    public AdminPaymentController(PaymentOptionRepository paymentOptionRepository,
                                  PaymentRequisitesRepository requisitesRepository,
                                  AdminAuditService audit,
                                  NotificationService notificationService) {
        this.paymentOptionRepository = paymentOptionRepository;
        this.requisitesRepository = requisitesRepository;
        this.audit = audit;
        this.notificationService = notificationService;
    }

    /**
     * The options the editor works with, in checkout order. {@code includeInactive=true} also
     * returns the switched-off ones (the editor shows them so they can be switched back on); they
     * stay in the table so historical orders keep a valid {@code payment_option_id}.
     */
    @GetMapping("/payment-options")
    @Operation(summary = "List payment options (active only unless includeInactive=true)")
    public List<AdminPaymentOptionDto> options(
            @RequestParam(name = "includeInactive", defaultValue = "false") boolean includeInactive) {
        List<PaymentOption> list = includeInactive
                ? paymentOptionRepository.findAllByOrderBySortOrderAsc()
                : paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc();
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
    @PutMapping("/payment-options")
    @Transactional
    @Operation(summary = "Save the list of payment options (upsert; missing ones are deactivated)")
    public List<AdminPaymentOptionDto> replaceOptions(@RequestBody List<AdminPaymentOptionDto> body) {
        List<AdminPaymentOptionDto> incoming = body == null ? List.of() : body;
        long activeCount = incoming.stream().filter(d -> d.active() == null || d.active()).count();
        if (activeCount == 0) {
            throw new BadRequestException(
                    "Нельзя выключить все способы оплаты — покупатели не смогут оформить заказ");
        }
        for (AdminPaymentOptionDto dto : incoming) {
            if (dto.title() == null || dto.title().isBlank()) {
                throw new BadRequestException("У каждого способа оплаты должно быть название");
            }
            if (dto.prepaymentMinor() < 0) {
                throw new BadRequestException("Предоплата не может быть отрицательной");
            }
        }

        Map<String, PaymentOption> existing = new LinkedHashMap<>();
        for (PaymentOption po : paymentOptionRepository.findAllByOrderBySortOrderAsc()) {
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
            PaymentOption saved = paymentOptionRepository.save(po);
            keptIds.add(UuidUtil.toString(saved.getId()));
        }

        // Removed from the list → hide it from checkout, but keep the row for old orders.
        for (Map.Entry<String, PaymentOption> entry : existing.entrySet()) {
            if (!keptIds.contains(entry.getKey()) && entry.getValue().isActive()) {
                entry.getValue().setActive(false);
                paymentOptionRepository.save(entry.getValue());
                changes.add("убран «" + entry.getValue().getTitle() + "»");
            }
        }
        audit.record("PAYMENT_OPTIONS", "PAYMENT", null,
                "активных: " + activeCount + " из " + incoming.size()
                        + (changes.isEmpty() ? "" : "; " + String.join(", ", changes)));
        return options(true);
    }

    @GetMapping("/payment-requisites")
    @Operation(summary = "Get payment requisites")
    public PaymentRequisitesDto requisites() {
        return requisitesRepository.findById(1)
                .map(AdminPaymentController::toReqDto)
                .orElse(new PaymentRequisitesDto(null, null, null, null, null, null));
    }

    @PutMapping("/payment-requisites")
    @Transactional
    @Operation(summary = "Update payment requisites")
    public PaymentRequisitesDto updateRequisites(@RequestBody PaymentRequisitesDto body) {
        if (body == null) {
            throw new BadRequestException("empty body");
        }
        PaymentRequisites r = requisitesRepository.findById(1).orElseGet(() -> {
            PaymentRequisites n = new PaymentRequisites();
            n.setId(1);
            return n;
        });
        PaymentRequisitesDto before = toReqDto(r);
        String problem = PaymentRequisitesRules.problem(before, body);
        if (problem != null) {
            throw new BadRequestException(problem);
        }
        r.setCardNumber(body.cardNumber());
        r.setIban(body.iban());
        r.setRecipient(body.recipient());
        r.setEdrpou(body.edrpou());
        r.setPurpose(body.purpose());
        r.setNote(body.note());
        PaymentRequisitesDto saved = toReqDto(requisitesRepository.save(r));

        // Payment details are money-critical: the log gets a MASKED diff (never full numbers), and
        // a swap of card/IBAN/recipient pings the seller's Telegram — after the commit only.
        List<String> diff = PaymentRequisitesRules.diff(before, saved);
        if (!diff.isEmpty()) {
            audit.record("PAYMENT_REQUISITES", "PAYMENT", null, String.join("; ", diff));
            if (PaymentRequisitesRules.moneyCritical(before, saved)) {
                String admin = audit.currentAdminName();
                afterCommit(() -> notificationService.onRequisitesChanged(admin, diff));
            }
        }
        return saved;
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
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

    private static PaymentRequisitesDto toReqDto(PaymentRequisites r) {
        return new PaymentRequisitesDto(
                r.getCardNumber(), r.getIban(), r.getRecipient(),
                r.getEdrpou(), r.getPurpose(), r.getNote());
    }
}
