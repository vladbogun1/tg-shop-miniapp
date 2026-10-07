package com.maxsolch.shop.support;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.media.UploadValidator;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.support.SupportDtos.CountDto;
import com.maxsolch.shop.support.SupportDtos.MessageDto;
import com.maxsolch.shop.support.SupportDtos.ThreadDto;
import com.maxsolch.shop.web.SecurityUtil;
import com.maxsolch.shop.web.dto.SendMessageRequest;
import com.maxsolch.shop.web.dto.UploadResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** Admin «Поддержка»: list, thread, reply, close/reopen. */
@RestController
@RequestMapping("/api/admin/support")
@RequiredAdmin
@Tag(name = "Admin Support", description = "Support threads (customer questions not tied to an order)")
@SecurityRequirement(name = "bearer-jwt")
public class AdminSupportController {

    private final SupportService support;
    private final AdminAuditService audit;
    private final ImageStorageService imageStorageService;
    private final UploadValidator uploadValidator;

    public AdminSupportController(SupportService support, AdminAuditService audit,
                                  ImageStorageService imageStorageService, UploadValidator uploadValidator) {
        this.support = support;
        this.audit = audit;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Open threads waiting for an answer (nav badge)")
    public CountDto unreadCount() {
        return new CountDto(support.countAwaiting());
    }

    @GetMapping("/threads")
    @Operation(summary = "Threads, latest activity first. filter = open (default) | awaiting | closed | all")
    public List<ThreadDto> list(@RequestParam(required = false) String filter,
                                @RequestParam(required = false) String q,
                                @RequestParam(required = false) Integer limit) {
        return support.adminList(filter, q, limit);
    }

    @GetMapping("/threads/{id}")
    @Operation(summary = "One thread")
    public ThreadDto get(@PathVariable String id) {
        return support.adminGet(id);
    }

    @GetMapping("/threads/{id}/messages")
    @Operation(summary = "Messages, newest page (before= for older ones), oldest-first")
    public List<MessageDto> messages(@PathVariable String id,
                                     @RequestParam(required = false) Long before,
                                     @RequestParam(required = false) Integer limit) {
        return support.adminMessages(id, before, limit);
    }

    @PostMapping("/threads/{id}/messages")
    @Operation(summary = "Answer — the customer gets a bot DM with a button to the thread")
    public MessageDto send(@PathVariable String id, @RequestBody SendMessageRequest req) {
        return support.sendAsAdmin(id, SecurityUtil.currentUserId(), audit.currentAdminName(), req);
    }

    /** Admin attachment: pictures or a PDF under the private {@code chat/} prefix (signed links). */
    @PostMapping("/threads/{id}/attachments")
    @Operation(summary = "Upload an attachment for this thread; returns the object key")
    public UploadResponse upload(@PathVariable String id, @RequestParam("file") MultipartFile file) {
        support.adminGet(id);
        uploadValidator.validateAttachment(file);
        return UploadResponse.ofKey(imageStorageService.uploadChatAttachment(file));
    }

    @PostMapping("/threads/{id}/read")
    @Operation(summary = "Mark the customer's messages read")
    public ResponseEntity<Void> markRead(@PathVariable String id) {
        support.markReadByAdmin(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/threads/{id}/close")
    @Operation(summary = "Close the thread")
    public ThreadDto close(@PathVariable String id) {
        return support.adminClose(id);
    }

    @PostMapping("/threads/{id}/reopen")
    @Operation(summary = "Reopen a closed thread")
    public ThreadDto reopen(@PathVariable String id) {
        return support.adminReopen(id);
    }
}
