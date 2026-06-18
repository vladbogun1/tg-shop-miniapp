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

import java.util.List;

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

    @GetMapping("/payment-options")
    @Operation(summary = "List all payment options")
    public List<AdminPaymentOptionDto> options() {
        return paymentOptionRepository.findAllByOrderBySortOrderAsc().stream()
                .map(this::toDto)
                .toList();
    }

    @PutMapping("/payment-options")
    @Transactional
    @Operation(summary = "Replace the full list of payment options")
    public List<AdminPaymentOptionDto> replaceOptions(@RequestBody List<AdminPaymentOptionDto> body) {
        paymentOptionRepository.deleteAll();
        int order = 0;
        for (AdminPaymentOptionDto dto : body) {
            PaymentOption po = new PaymentOption();
            if (dto.id() != null && !dto.id().isBlank()) {
                try {
                    po.setId(UuidUtil.toBytes(dto.id()));
                } catch (IllegalArgumentException ignored) {
                    // generate a fresh id via @PrePersist
                }
            }
            po.setTitle(dto.title());
            po.setDescription(dto.description());
            po.setRequiresPrepayment(dto.requiresPrepayment());
            po.setPrepaymentMinor(dto.prepaymentMinor());
            po.setSortOrder(dto.sortOrder() == 0 ? order : dto.sortOrder());
            po.setActive(dto.active());
            paymentOptionRepository.save(po);
            order++;
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
