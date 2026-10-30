package com.maxsolch.shop.support.api;

import com.maxsolch.shop.support.app.CustomerSupport;
import com.maxsolch.shop.support.app.SupportService;

import com.maxsolch.shop.support.app.SupportDtos.ConfigDto;
import com.maxsolch.shop.support.app.SupportDtos.CountDto;
import com.maxsolch.shop.support.app.SupportDtos.CreateThreadRequest;
import com.maxsolch.shop.support.app.SupportDtos.MessageDto;
import com.maxsolch.shop.support.app.SupportDtos.ThreadDto;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.order.app.SendMessageRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Customer side of support (Mini App and site). Attachments go through the existing
 * {@code POST /api/me/uploads}; a message may only reference the customer's own upload.
 */
@RestController
@RequestMapping("/api/me/support")
@Tag(name = "Support", description = "Customer support threads (questions not tied to an order)")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class SupportController {

    private final SupportService support;
    private final CustomerSupport customer;
    private final CurrentActor actor;

    public SupportController(SupportService support, CustomerSupport customer, CurrentActor actor) {
        this.support = support;
        this.customer = customer;
        this.actor = actor;
    }

    @GetMapping("/config")
    @Operation(summary = "Whether support is on and the message limits")
    public ConfigDto config() {
        return support.config();
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Unread shop answers across my threads")
    public CountDto unreadCount() {
        return new CountDto(support.unreadForCustomer(actor.userId()));
    }

    @GetMapping("/threads")
    @Operation(summary = "My support threads, latest activity first")
    public List<ThreadDto> list() {
        return support.listMine(actor.userId());
    }

    @PostMapping("/threads")
    @Operation(summary = "Ask a question (optionally about a product); an open thread about the same product is reused")
    public ThreadDto create(@RequestBody CreateThreadRequest req) {
        return customer.ask(req);
    }

    @GetMapping("/threads/{id}")
    @Operation(summary = "One of my threads")
    public ThreadDto get(@PathVariable String id) {
        return support.getMine(actor.userId(), id);
    }

    @GetMapping("/threads/{id}/messages")
    @Operation(summary = "Messages, newest page (before= for older ones), oldest-first")
    public List<MessageDto> messages(@PathVariable String id,
                                     @RequestParam(required = false) Long before,
                                     @RequestParam(required = false) Integer limit) {
        return support.messagesMine(actor.userId(), id, before, limit);
    }

    @PostMapping("/threads/{id}/messages")
    @Operation(summary = "Write to my thread (reopens a closed one)")
    public MessageDto send(@PathVariable String id, @RequestBody SendMessageRequest req) {
        return customer.write(id, req);
    }

    @PostMapping("/threads/{id}/read")
    @Operation(summary = "Mark the shop's answers read")
    public ResponseEntity<Void> markRead(@PathVariable String id) {
        support.markReadByCustomer(actor.userId(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/threads/{id}/close")
    @Operation(summary = "Close my thread (question answered)")
    public ThreadDto close(@PathVariable String id) {
        return support.closeByCustomer(actor.userId(), id);
    }
}
