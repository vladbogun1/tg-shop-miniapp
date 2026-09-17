package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.PaymentRequisites;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.PaymentRequisitesRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.web.dto.AdminPaymentOptionDto;
import com.maxsolch.shop.web.dto.PaymentRequisitesDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

    public AdminPaymentController(PaymentOptionRepository paymentOptionRepository,
                                  PaymentRequisitesRepository requisitesRepository) {
        this.paymentOptionRepository = paymentOptionRepository;
        this.requisitesRepository = requisitesRepository;
    }

    /**
     * The options the editor works with. Deactivated ones are intentionally hidden: they only exist
     * so historical orders keep a valid {@code payment_option_id} reference (see replaceOptions).
     */
    @GetMapping("/payment-options")
    @Operation(summary = "List active payment options")
    public List<AdminPaymentOptionDto> options() {
        return paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc().stream()
                .map(this::toDto)
                .toList();
    }

    /**
     * Saves the list of payment options as an upsert + soft delete.
     *
     * <p>It used to {@code deleteAll()} and re-insert. Orders reference {@code payment_option_id}
     * with {@code ON DELETE SET NULL}, so every save quietly detached the payment option from all
     * historical orders — and a customer checking out during that window got "unknown payment
     * option". Now surviving rows are updated in place, and options that disappear from the list
     * are merely deactivated so existing orders keep pointing at something real.
     */
    @PutMapping("/payment-options")
    @Transactional
    @Operation(summary = "Save the list of payment options (upsert; missing ones are deactivated)")
    public List<AdminPaymentOptionDto> replaceOptions(@RequestBody List<AdminPaymentOptionDto> body) {
        List<AdminPaymentOptionDto> incoming = body == null ? List.of() : body;

        Map<String, PaymentOption> existing = new LinkedHashMap<>();
        for (PaymentOption po : paymentOptionRepository.findAllByOrderBySortOrderAsc()) {
            existing.put(UuidUtil.toString(po.getId()), po);
        }

        Set<String> keptIds = new HashSet<>();
        int order = 0;
        for (AdminPaymentOptionDto dto : incoming) {
            PaymentOption po = null;
            if (dto.id() != null && !dto.id().isBlank()) {
                po = existing.get(dto.id().trim());
            }
            if (po == null) {
                po = new PaymentOption();
            }
            po.setTitle(dto.title());
            po.setDescription(dto.description());
            po.setRequiresPrepayment(dto.requiresPrepayment());
            po.setPrepaymentMinor(dto.prepaymentMinor());
            po.setSortOrder(dto.sortOrder() == 0 ? order : dto.sortOrder());
            // No active toggle in the admin UI yet → an option present in the list is active.
            po.setActive(dto.active() == null || dto.active());
            PaymentOption saved = paymentOptionRepository.save(po);
            keptIds.add(UuidUtil.toString(saved.getId()));
            order++;
        }

        // Removed from the list → hide it from checkout, but keep the row for old orders.
        for (Map.Entry<String, PaymentOption> entry : existing.entrySet()) {
            if (!keptIds.contains(entry.getKey()) && entry.getValue().isActive()) {
                entry.getValue().setActive(false);
                paymentOptionRepository.save(entry.getValue());
            }
        }
        return options();
    }

    @GetMapping("/payment-requisites")
    @Operation(summary = "Get payment requisites")
    public PaymentRequisitesDto requisites() {
        return requisitesRepository.findById(1)
                .map(this::toReqDto)
                .orElse(new PaymentRequisitesDto(null, null, null, null, null, null));
    }

    @PutMapping("/payment-requisites")
    @Transactional
    @Operation(summary = "Update payment requisites")
    public PaymentRequisitesDto updateRequisites(@RequestBody PaymentRequisitesDto body) {
        PaymentRequisites r = requisitesRepository.findById(1).orElseGet(() -> {
            PaymentRequisites n = new PaymentRequisites();
            n.setId(1);
            return n;
        });
        r.setCardNumber(body.cardNumber());
        r.setIban(body.iban());
        r.setRecipient(body.recipient());
        r.setEdrpou(body.edrpou());
        r.setPurpose(body.purpose());
        r.setNote(body.note());
        return toReqDto(requisitesRepository.save(r));
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

    private PaymentRequisitesDto toReqDto(PaymentRequisites r) {
        return new PaymentRequisitesDto(
                r.getCardNumber(), r.getIban(), r.getRecipient(),
                r.getEdrpou(), r.getPurpose(), r.getNote());
    }
}
