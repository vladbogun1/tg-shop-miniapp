package com.maxsolch.shop.notification.api;

import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.notification.app.BroadcastService;
import com.maxsolch.shop.platform.web.SecurityUtil;
import com.maxsolch.shop.notification.app.BroadcastHistoryDto;
import com.maxsolch.shop.notification.app.BroadcastRequest;
import com.maxsolch.shop.notification.app.BroadcastResult;
import com.maxsolch.shop.notification.app.BroadcastStatus;
import com.maxsolch.shop.notification.app.BroadcastTestRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/broadcast")
@RequiredAdmin
@Tag(name = "Admin Broadcast", description = "Send HTML Telegram broadcasts to bot users")
@SecurityRequirement(name = "bearer-jwt")
public class AdminBroadcastController {

    private final BroadcastService broadcastService;
    private final AdminAuditService audit;

    public AdminBroadcastController(BroadcastService broadcastService,
                                    AdminAuditService audit) {
        this.broadcastService = broadcastService;
        this.audit = audit;
    }

    @GetMapping("/audiences")
    @Operation(summary = "Reachable audience sizes (all/active/inactive/premium), optionally for one language")
    public Map<String, Long> audiences(@RequestParam(required = false) String lang) {
        return broadcastService.audienceCounts(lang);
    }

    @GetMapping("/status")
    @Operation(summary = "Progress of the running/last broadcast")
    public BroadcastStatus status() {
        return broadcastService.status();
    }

    @GetMapping("/history")
    @Operation(summary = "Past broadcasts, newest first (text, audience, result, who)")
    public List<BroadcastHistoryDto> history(@RequestParam(defaultValue = "20") int limit) {
        return broadcastService.history(limit);
    }

    @PostMapping("/test")
    @Operation(summary = "Send one test message (telegramUserId null = to yourself)")
    public BroadcastResult test(@Valid @RequestBody BroadcastTestRequest req) {
        long to = req.telegramUserId() != null ? req.telegramUserId() : SecurityUtil.currentUserId();
        BroadcastResult result = broadcastService.test(req.text(), to, req.withButton(), req.buttonText());
        audit.record("BROADCAST_TEST", "BROADCAST", null,
                "тест → " + (req.telegramUserId() == null ? "себе" : String.valueOf(to))
                        + (result.ok() ? "" : " (" + result.detail() + ")"));
        return result;
    }

    @PostMapping
    @Operation(summary = "Start an async broadcast to the chosen audience")
    public BroadcastStatus start(@Valid @RequestBody BroadcastRequest req) {
        BroadcastService.Started started = broadcastService.start(req,
                SecurityUtil.currentUserId(), audit.currentAdminName());
        // Written after the start succeeded: a refused start ("уже идёт") is not an action.
        String langs = (req.textUk() != null && !req.textUk().isBlank() ? " uk" : "")
                + (req.textRu() != null && !req.textRu().isBlank() ? " ru" : "")
                + (req.textEn() != null && !req.textEn().isBlank() ? " en" : "");
        audit.record("BROADCAST_START", "BROADCAST", String.valueOf(started.historyId()),
                "аудитория " + (req.audience() == null ? "all" : req.audience())
                        + (req.lang() == null || req.lang().isBlank() ? "" : ", язык " + req.lang())
                        + ", получателей " + started.recipients()
                        + (langs.isEmpty() ? "" : ", версии:" + langs));
        return started.status();
    }
}
