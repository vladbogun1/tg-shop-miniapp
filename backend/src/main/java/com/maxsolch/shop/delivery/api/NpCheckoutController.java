package com.maxsolch.shop.delivery.api;

import com.maxsolch.shop.delivery.app.NpCheckout;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Checkout helpers for the Nova Poshta courier and the price hint (public, like the directory). */
@RestController
@RequestMapping("/api/np")
@Tag(name = "Nova Poshta checkout", description = "Street search and delivery price estimate")
public class NpCheckoutController {

    private final NpCheckout checkout;

    public NpCheckoutController(NpCheckout checkout) {
        this.checkout = checkout;
    }

    @GetMapping("/config")
    @Operation(summary = "Nova Poshta checkout switches: parcel lockers, courier, price hint")
    public NpCheckout.CheckoutConfig config() {
        return checkout.config();
    }

    @GetMapping("/streets")
    @Operation(summary = "Streets of a Nova Poshta city (courier delivery)")
    public List<NpCheckout.Street> streets(@RequestParam String cityRef, @RequestParam(required = false) String q) {
        return checkout.streets(cityRef, q);
    }

    @PostMapping("/estimate")
    @Operation(summary = "Approximate Nova Poshta delivery price for a cart (cached)")
    public NpCheckout.EstimateResponse estimate(@RequestBody NpCheckout.EstimateRequest body) {
        return checkout.estimate(body);
    }
}
