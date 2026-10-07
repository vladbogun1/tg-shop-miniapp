package com.maxsolch.shop.support;

import com.maxsolch.shop.support.SupportDtos.ConfigDto;
import com.maxsolch.shop.support.SupportDtos.CountDto;
import com.maxsolch.shop.support.SupportDtos.CreateThreadRequest;
import com.maxsolch.shop.support.SupportDtos.MessageDto;
import com.maxsolch.shop.support.SupportDtos.ThreadDto;
import com.maxsolch.shop.web.SecurityUtil;
import com.maxsolch.shop.web.dto.SendMessageRequest;
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

    /** «Журнал → Бот и сайт»: questions to support (not their text). */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.maxsolch.shop.journal.ActivityLog activity;

    public SupportController(SupportService support) {
        this.support = support;
    }

    @GetMapping("/config")
    @Operation(summary = "Whether support is on and the message limits")
    public ConfigDto config() {
        return support.config();
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Unread shop answers across my threads")
    public CountDto unreadCount() {
        return new CountDto(support.unreadForCustomer(SecurityUtil.currentUserId()));
    }

    @GetMapping("/threads")
    @Operation(summary = "My support threads, latest activity first")
    public List<ThreadDto> list() {
        return support.listMine(SecurityUtil.currentUserId());
    }

    @PostMapping("/threads")
    @Operation(summary = "Ask a question (optionally about a product); an open thread about the same product is reused")
    public ThreadDto create(@RequestBody CreateThreadRequest req) {
        String source = SecurityUtil.currentPrincipal().isWeb() ? SupportService.SOURCE_WEB : SupportService.SOURCE_MINIAPP;
        ThreadDto thread = support.create(SecurityUtil.currentUserId(), source, req);
        journal(com.maxsolch.shop.journal.ActivityLog.fromRequest("SUPPORT_REQUEST")
                .text(thread.productTitle() != null && !thread.productTitle().isBlank()
                        ? "Вопрос в поддержку о товаре «" + thread.productTitle() + "»"
                        : "Вопрос в поддержку")
                .detail("thread", thread.id()));
        return thread;
    }

    @GetMapping("/threads/{id}")
    @Operation(summary = "One of my threads")
    public ThreadDto get(@PathVariable String id) {
        return support.getMine(SecurityUtil.currentUserId(), id);
    }

    @GetMapping("/threads/{id}/messages")
    @Operation(summary = "Messages, newest page (before= for older ones), oldest-first")
    public List<MessageDto> messages(@PathVariable String id,
                                     @RequestParam(required = false) Long before,
                                     @RequestParam(required = false) Integer limit) {
        return support.messagesMine(SecurityUtil.currentUserId(), id, before, limit);
    }

    @PostMapping("/threads/{id}/messages")
    @Operation(summary = "Write to my thread (reopens a closed one)")
    public MessageDto send(@PathVariable String id, @RequestBody SendMessageRequest req) {
        MessageDto sent = support.sendAsCustomer(SecurityUtil.currentUserId(), id, req);
        journal(com.maxsolch.shop.journal.ActivityLog.fromRequest("SUPPORT_MESSAGE")
                .text("Сообщение в поддержку").detail("thread", id));
        return sent;
    }

    @PostMapping("/threads/{id}/read")
    @Operation(summary = "Mark the shop's answers read")
    public ResponseEntity<Void> markRead(@PathVariable String id) {
        support.markReadByCustomer(SecurityUtil.currentUserId(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/threads/{id}/close")
    @Operation(summary = "Close my thread (question answered)")
    public ThreadDto close(@PathVariable String id) {
        return support.closeByCustomer(SecurityUtil.currentUserId(), id);
    }

    private void journal(com.maxsolch.shop.journal.ActivityLog.Entry entry) {
        if (activity != null) {
            activity.record(entry);
        }
    }
}
