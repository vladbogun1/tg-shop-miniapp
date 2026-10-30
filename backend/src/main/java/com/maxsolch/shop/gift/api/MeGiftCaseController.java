package com.maxsolch.shop.gift.api;

import com.maxsolch.shop.gift.app.CustomerGiftCase;
import com.maxsolch.shop.gift.app.GiftDtos;
import com.maxsolch.shop.order.app.OrderGiftDtos;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.translation.domain.ContentLocale;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;

/** The gift case of the customer's own order (V57): open it, swap the prize, pick its size. */
@RestController
@RequestMapping("/api/me")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MeGiftCaseController {

    private final CustomerGiftCase giftCase;
    private final CurrentActor actor;

    public MeGiftCaseController(CustomerGiftCase giftCase, CurrentActor actor) {
        this.giftCase = giftCase;
        this.actor = actor;
    }

    @PostMapping("/orders/{id}/gift-case/open")
    @Operation(summary = "Open the gift case of my order (once, paid orders only): the prize drawn at checkout, "
            + "the tier's prizes for the reel, the code of a discount prize and the swap offer")
    public GiftDtos.CaseOpenDto openGiftCase(@PathVariable String id, Locale locale) {
        return giftCase.open(id, actor.userId(), ContentLocale.normalize(locale));
    }

    @PostMapping("/orders/{id}/gift-case/swap")
    @Operation(summary = "Swap the case prize (similar to what I bought) for a personal code on the next order; "
            + "the prize leaves the order. 400 GIFT_CASE_SWAP_UNAVAILABLE when it is not offered")
    public GiftDtos.CaseOpenDto swapGiftCase(@PathVariable String id, Locale locale) {
        return giftCase.swap(id, actor.userId(), ContentLocale.normalize(locale));
    }

    public record CaseSizeRequest(String variantId) {
    }

    @PostMapping("/orders/{id}/gift-case/size")
    @Operation(summary = "Pick the size of my case prize (a product with sizes) among those in stock while the order "
            + "is being put together; 400 GIFT_CASE_SIZE_UNAVAILABLE when that size is gone or it is too late")
    public OrderGiftDtos.SizeDto chooseGiftCaseSize(@PathVariable String id, @RequestBody CaseSizeRequest req) {
        return giftCase.chooseSize(id, actor.userId(), req.variantId());
    }
}
