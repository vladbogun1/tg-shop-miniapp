package com.maxsolch.shop.analytics.api;

import com.maxsolch.shop.analytics.ClientEventBatch;
import com.maxsolch.shop.analytics.ClientEventService;
import com.maxsolch.shop.platform.web.CurrentActor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MeAnalyticsController {

    private final ClientEventService clientEventService;
    private final CurrentActor actor;

    public MeAnalyticsController(ClientEventService clientEventService, CurrentActor actor) {
        this.clientEventService = clientEventService;
        this.actor = actor;
    }

    /**
     * Takes the Mini App's buffered interaction journal.
     *
     * <p>There was no way to see what a customer actually did before they gave up — only the
     * orders and messages that came out of it. The client keeps events locally and flushes them on
     * a timer and on close, so the database sees occasional batches instead of a write per tap.
     * Never fails loudly: a rejected batch would be noise in the app for data nobody is waiting on.
     */
    @PostMapping("/analytics")
    @Operation(summary = "Submit a batch of buffered client events")
    public ResponseEntity<Void> analytics(@RequestBody ClientEventBatch batch) {
        clientEventService.record(actor.userId(), batch);
        return ResponseEntity.noContent().build();
    }
}
