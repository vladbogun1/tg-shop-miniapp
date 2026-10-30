package com.maxsolch.shop.support.api;

import com.maxsolch.shop.support.app.AdminReplyTemplates;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.support.app.ReplyTemplateService;
import com.maxsolch.shop.support.app.ReplyTemplateDtos.RenderedTemplateDto;
import com.maxsolch.shop.support.app.ReplyTemplateDtos.TemplateDto;
import com.maxsolch.shop.support.app.ReplyTemplateDtos.TemplateUpsertRequest;
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
    private final AdminReplyTemplates admin;

    public AdminReplyTemplateController(ReplyTemplateService service, AdminReplyTemplates admin) {
        this.service = service;
        this.admin = admin;
    }

    @GetMapping("/api/admin/reply-templates")
    @Operation(summary = "All templates (all languages), in display order")
    public List<TemplateDto> list() {
        return service.list();
    }

    @PostMapping("/api/admin/reply-templates")
    @Operation(summary = "Create a template")
    public TemplateDto create(@Valid @RequestBody TemplateUpsertRequest req) {
        return admin.create(req);
    }

    @PutMapping("/api/admin/reply-templates/{id}")
    @Operation(summary = "Update a template")
    public TemplateDto update(@PathVariable long id, @Valid @RequestBody TemplateUpsertRequest req) {
        return admin.update(id, req);
    }

    @DeleteMapping("/api/admin/reply-templates/{id}")
    @Operation(summary = "Delete a template")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        admin.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/admin/orders/{orderId}/reply-templates")
    @Operation(summary = "Templates filled in for an order, in the customer's language")
    public List<RenderedTemplateDto> forOrder(@PathVariable String orderId) {
        return service.renderForOrder(orderId);
    }
}
