package com.maxsolch.shop.analytics.api;

import com.maxsolch.shop.analytics.app.ClientEventService;
import com.maxsolch.shop.analytics.app.StaffVisitors;
import com.maxsolch.shop.analytics.app.WebEventBatch;
import com.maxsolch.shop.platform.web.ClientIp;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.customer.app.VisitorLocationService;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Event journal of the public website. Open to anonymous visitors (the funnel starts long before
 * anyone signs in); when the {@code access} cookie is present the events are also tied to the
 * customer's Telegram id. Rate-limited per IP together with the other {@code /api/public/**} calls.
 */
@RestController
@RequestMapping("/api/public")
@Tag(name = "Public analytics", description = "Website event journal (batched)")
public class PublicAnalyticsController {

    private final ClientEventService clientEventService;
    private final VisitorLocationService visitorLocations;
    private final CurrentActor actor;

    public PublicAnalyticsController(ClientEventService clientEventService,
                                     VisitorLocationService visitorLocations, CurrentActor actor) {
        this.clientEventService = clientEventService;
        this.visitorLocations = visitorLocations;
        this.actor = actor;
    }

    @PostMapping("/analytics")
    @Operation(summary = "Submit a batch of website events (anonymous or signed-in)")
    public ResponseEntity<Void> analytics(@RequestBody WebEventBatch batch, HttpServletRequest request) {
        Long customer = actor.principalIfPresent().map(AuthPrincipal::telegramUserId).orElse(null);
        String userAgent = request.getHeader("User-Agent");
        // Crawlers that run JavaScript are not visitors: neither in the funnel nor on the users map.
        // A browser the admin panel marked as staff is not a customer either (StaffVisitors).
        if (ClientEventService.isBot(userAgent) || isStaffBrowser(request)) {
            return ResponseEntity.noContent().build();
        }
        clientEventService.recordWeb(customer, batch, userAgent);
        // Users map: throttled, asynchronous, never throws.
        visitorLocations.touchWeb(customer, batch == null ? null : batch.anonId(), ClientIp.of(request));
        return ResponseEntity.noContent().build();
    }

    /** Cookie {@code mx_staff} that the admin panel sets on the shop's parent domain after sign-in. */
    static boolean isStaffBrowser(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return false;
        }
        for (Cookie c : cookies) {
            if (StaffVisitors.STAFF_COOKIE.equals(c.getName()) && "1".equals(c.getValue())) {
                return true;
            }
        }
        return false;
    }
}
