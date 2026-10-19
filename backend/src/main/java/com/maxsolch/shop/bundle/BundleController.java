package com.maxsolch.shop.bundle;

import com.maxsolch.shop.bundle.BundleDtos.ProductOfferDto;
import com.maxsolch.shop.bundle.BundleDtos.QuoteDto;
import com.maxsolch.shop.bundle.BundleDtos.QuoteRequest;
import com.maxsolch.shop.translation.ContentLocale;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;

/**
 * «Вместе дешевле» for the site and the Mini App (no sign-in: the site's guests have carts too).
 * Read-only: the checkout prices the bundle again itself, these numbers are for showing.
 */
@RestController
@RequestMapping("/api/public/bundles")
@Tag(name = "Bundles", description = "«Вместе дешевле»")
public class BundleController {

    private final BundleService service;

    public BundleController(BundleService service) {
        this.service = service;
    }

    @GetMapping("/product/{id}")
    @Operation(summary = "Accessories to offer with a product, and the bundle terms (tiers, limits)")
    public ProductOfferDto product(@PathVariable String id, Locale locale) {
        return service.offerFor(id, ContentLocale.normalize(locale));
    }

    @PostMapping("/quote")
    @Operation(summary = "Cart quote: bundle discount per line, which discount wins vs the promo code, "
            + "suggestions for the cart")
    public QuoteDto quote(@RequestBody(required = false) QuoteRequest body, Locale locale) {
        return service.quote(body, ContentLocale.normalize(locale));
    }
}
