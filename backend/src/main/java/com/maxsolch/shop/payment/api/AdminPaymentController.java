package com.maxsolch.shop.payment.api;

import com.maxsolch.shop.payment.app.AdminPaymentOptionDto;
import com.maxsolch.shop.payment.app.PaymentOptions;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredAdmin
@Tag(name = "Admin Payment", description = "Admin payment options")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPaymentController {

    private final PaymentOptions paymentOptions;

    public AdminPaymentController(PaymentOptions paymentOptions) {
        this.paymentOptions = paymentOptions;
    }

    /**
     * The options the editor works with, in checkout order. {@code includeInactive=true} also
     * returns the switched-off ones (the editor shows them so they can be switched back on); they
     * stay in the table so historical orders keep a valid {@code payment_option_id}.
     */
    @GetMapping("/payment-options")
    @Operation(summary = "List payment options (active only unless includeInactive=true)")
    public List<AdminPaymentOptionDto> options(
            @RequestParam(name = "includeInactive", defaultValue = "false") boolean includeInactive) {
        return paymentOptions.forAdmin(includeInactive);
    }

    /** Upsert + soft delete; the list order is the checkout order (rules in {@link PaymentOptions#replace}). */
    @PutMapping("/payment-options")
    @Operation(summary = "Save the list of payment options (upsert; missing ones are deactivated)")
    public List<AdminPaymentOptionDto> replaceOptions(@RequestBody List<AdminPaymentOptionDto> body) {
        return paymentOptions.replace(body);
    }
}
