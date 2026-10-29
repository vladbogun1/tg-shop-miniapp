package com.maxsolch.shop.cart.api;

import com.maxsolch.shop.cart.app.CartDtos;
import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.cart.app.CartDtos.CartDto;
import com.maxsolch.shop.cart.app.CartDtos.CartWriteRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;

/**
 * The customer's cart, shared by the website (cookie) and the Mini App (bearer) — one Telegram
 * account, one cart. Every answer is the whole cart with today's product data in the request
 * language ({@code Accept-Language}). Contract: docs/SITE-SPEC.md, «Серверная корзина».
 */
@RestController
@RequestMapping("/api/me/cart")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MeCartController {

    private final CartService cartService;
    private final CurrentActor actor;

    public MeCartController(CartService cartService, CurrentActor actor) {
        this.actor = actor;
        this.cartService = cartService;
    }

    @GetMapping
    @Operation(summary = "My cart with current prices, stock and availability")
    public CartDto get(Locale locale) {
        return cartService.get(actor.userId(), ContentLocale.normalize(locale));
    }

    @PutMapping
    @Operation(summary = "Replace the whole cart (last write wins)")
    public CartDto replace(@Valid @RequestBody CartWriteRequest req, Locale locale) {
        return cartService.replace(actor.userId(), req.lines(), ContentLocale.normalize(locale));
    }

    @PostMapping("/merge")
    @Operation(summary = "Merge a guest cart into mine (same line: the larger quantity)")
    public CartDto merge(@Valid @RequestBody CartWriteRequest req, Locale locale) {
        return cartService.merge(actor.userId(), req.lines(), ContentLocale.normalize(locale));
    }
}
