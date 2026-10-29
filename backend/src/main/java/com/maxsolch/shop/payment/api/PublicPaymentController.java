package com.maxsolch.shop.payment.api;

import com.maxsolch.shop.payment.app.PaymentOptionDto;
import com.maxsolch.shop.payment.app.PaymentOptions;
import com.maxsolch.shop.translation.domain.ContentLocale;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api")
@Tag(name = "Public", description = "Public payment options")
public class PublicPaymentController {

    private final PaymentOptions paymentOptions;

    public PublicPaymentController(PaymentOptions paymentOptions) {
        this.paymentOptions = paymentOptions;
    }

    @GetMapping("/payment-options")
    @Operation(summary = "List active payment options (title/description translated for uk/en, ?lang= wins)")
    public List<PaymentOptionDto> paymentOptions(Locale locale) {
        return paymentOptions.activeLocalized(ContentLocale.normalize(locale));
    }
}
