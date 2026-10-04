package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.inbox.InboxDtos.DismissRequest;
import com.maxsolch.shop.inbox.InboxDtos.Inbox;
import com.maxsolch.shop.inbox.InboxDtos.RestoreRequest;
import com.maxsolch.shop.inbox.InboxDtos.SnoozeRequest;
import com.maxsolch.shop.inbox.InboxDtos.SnoozeResult;
import com.maxsolch.shop.inbox.InboxService;
import com.maxsolch.shop.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * «Внимание»: one screen with everything waiting for the owner — payment claims, unread chats,
 * stuck orders, refusals/returns, stock running out, a failed site rebuild.
 */
@RestController
@RequestMapping("/api/admin/inbox")
@RequiredAdmin
@Tag(name = "Admin Inbox", description = "What needs the owner's attention now")
@SecurityRequirement(name = "bearer-jwt")
public class AdminInboxController {

    private final InboxService inbox;

    public AdminInboxController(InboxService inbox) {
        this.inbox = inbox;
    }

    @GetMapping
    @Operation(summary = "Groups of rows in order of urgency, with counts (snoozed/dismissed rows hidden)")
    public Inbox get() {
        return inbox.inbox();
    }

    @PostMapping("/snooze")
    @Operation(summary = "Hide a row for 1 h / until 9:00 / 3 days (preset HOUR | TOMORROW | DAYS3)")
    public SnoozeResult snooze(@RequestBody SnoozeRequest body) {
        return inbox.snooze(body);
    }

    @PostMapping("/dismiss")
    @Operation(summary = "Mark an informational row as handled (written to the admin journal)")
    public ResponseEntity<Void> dismiss(@RequestBody DismissRequest body) {
        inbox.dismiss(body);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/restore")
    @Operation(summary = "Undo a snooze or dismissal: the row is shown again")
    public ResponseEntity<Void> restore(@RequestBody RestoreRequest body) {
        inbox.restore(body);
        return ResponseEntity.noContent().build();
    }
}
