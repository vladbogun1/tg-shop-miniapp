package com.maxsolch.shop.gift.api;

import com.maxsolch.shop.gift.app.GiftService;

import com.maxsolch.shop.gift.app.GiftDtos.GiftResponse;
import com.maxsolch.shop.translation.domain.ContentLocale;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;

/** The gift for the order sum for the site and the Mini App (no sign-in: guests have carts too). */
@RestController
@RequestMapping("/api/public/gift")
@Tag(name = "Gift", description = "The gift for the order sum / the gift case")
public class GiftController {

    private final GiftService service;

    public GiftController(GiftService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "What the shop gives for the order sum now: the threshold, one product or the case prizes "
            + "with chances; gift = null when off")
    public GiftResponse gift(Locale locale) {
        return new GiftResponse(service.info(ContentLocale.normalize(locale)).orElse(null));
    }
}
