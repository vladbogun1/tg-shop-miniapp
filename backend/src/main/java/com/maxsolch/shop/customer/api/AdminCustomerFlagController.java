package com.maxsolch.shop.customer.api;

import com.maxsolch.shop.customer.app.CustomerFlagging;
import com.maxsolch.shop.customer.app.CustomerFlags;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/users/{telegramUserId}/flag")
@RequiredAdmin
@Tag(name = "Admin Users", description = "Bot users list + analytics")
@SecurityRequirement(name = "bearer-jwt")
public class AdminCustomerFlagController {

    public record FlagRequest(String reason) {
    }

    private final CustomerFlagging flagging;

    public AdminCustomerFlagController(CustomerFlagging flagging) {
        this.flagging = flagging;
    }

    @PutMapping
    @Operation(summary = "Mark the customer as a problem buyer (or change the reason): only full online payment at checkout")
    public CustomerFlags.Flag flag(@PathVariable long telegramUserId, @RequestBody FlagRequest body) {
        return flagging.flag(telegramUserId, body == null ? null : body.reason());
    }

    @DeleteMapping
    @Operation(summary = "Take the problem-buyer mark off")
    public ResponseEntity<Void> clear(@PathVariable long telegramUserId) {
        flagging.clear(telegramUserId);
        return ResponseEntity.noContent().build();
    }
}
