package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.ReplyTemplateService;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.RenderedTemplateDto;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.TemplateDto;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.TemplateUpsertRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Canned chat replies (⚡ in the order chat). */
@RestController
@RequiredAdmin
@Tag(name = "Admin Reply Templates", description = "Canned order-chat replies with order placeholders")
@SecurityRequirement(name = "bearer-jwt")
public class AdminReplyTemplateController {

    private final ReplyTemplateService service;
    private final AdminAuditService audit;

    public AdminReplyTemplateController(ReplyTemplateService service, AdminAuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    @GetMapping("/api/admin/reply-templates")
    @Operation(summary = "All templates (all languages), in display order")
    public List<TemplateDto> list() {
        return service.list();
    }

    @PostMapping("/api/admin/reply-templates")
    @Operation(summary = "Create a template")
    public TemplateDto create(@Valid @RequestBody TemplateUpsertRequest req) {
        TemplateDto dto = service.create(req);
        audit.record("REPLY_TEMPLATE_CREATE", "REPLY_TEMPLATE", String.valueOf(dto.id()), "шаблон «" + dto.title() + "»");
        return dto;
    }

    @PutMapping("/api/admin/reply-templates/{id}")
    @Operation(summary = "Update a template")
    public TemplateDto update(@PathVariable long id, @Valid @RequestBody TemplateUpsertRequest req) {
        TemplateDto dto = service.update(id, req);
        audit.record("REPLY_TEMPLATE_UPDATE", "REPLY_TEMPLATE", String.valueOf(id), "шаблон «" + dto.title() + "»");
        return dto;
    }

    @DeleteMapping("/api/admin/reply-templates/{id}")
    @Operation(summary = "Delete a template")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        String title = service.delete(id);
        audit.record("REPLY_TEMPLATE_DELETE", "REPLY_TEMPLATE", String.valueOf(id), "удалён шаблон «" + title + "»");
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/admin/orders/{orderId}/reply-templates")
    @Operation(summary = "Templates filled in for an order, in the customer's language")
    public List<RenderedTemplateDto> forOrder(@PathVariable String orderId) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(orderId);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException("order not found");
        }
        return service.renderForOrder(key);
    }
}
