package com.maxsolch.shop.gift.api;

import com.maxsolch.shop.gift.app.GiftCaseService;
import com.maxsolch.shop.gift.app.GiftDtos;
import com.maxsolch.shop.order.app.CustomerOrders;
import com.maxsolch.shop.order.app.OrderGiftDtos;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.platform.journal.ActivityLog;
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

    private final CustomerOrders customerOrders;
    private final GiftCaseService giftCaseService;
    private final ActivityLog activity;
    private final CurrentActor actor;

    public MeGiftCaseController(CustomerOrders customerOrders, GiftCaseService giftCaseService,
                                ActivityLog activity, CurrentActor actor) {
        this.customerOrders = customerOrders;
        this.giftCaseService = giftCaseService;
        this.activity = activity;
        this.actor = actor;
    }

    @PostMapping("/orders/{id}/gift-case/open")
    @Operation(summary = "Open the gift case of my order (once, paid orders only): the prize drawn at checkout, "
            + "the tier's prizes for the reel, the code of a discount prize and the swap offer")
    public GiftDtos.CaseOpenDto openGiftCase(@PathVariable String id, Locale locale) {
        Order order = ownedOrder(id);
        GiftDtos.CaseOpenDto opened = giftCaseService.open(order.getId(), ContentLocale.normalize(locale));
        activity.record(ActivityLog.fromRequest("GIFT_CASE_OPENED").order(order.getId())
                .text("Покупатель открыл кейс (" + opened.tier() + "): " + prizeText(opened.won())
                        + " (" + opened.won().rarity() + ")"));
        return opened;
    }

    @PostMapping("/orders/{id}/gift-case/swap")
    @Operation(summary = "Swap the case prize (similar to what I bought) for a personal code on the next order; "
            + "the prize leaves the order. 400 GIFT_CASE_SWAP_UNAVAILABLE when it is not offered")
    public GiftDtos.CaseOpenDto swapGiftCase(@PathVariable String id, Locale locale) {
        Order order = ownedOrder(id);
        GiftDtos.CaseOpenDto swapped = giftCaseService.swap(order.getId(), ContentLocale.normalize(locale));
        activity.record(ActivityLog.fromRequest("GIFT_CASE_SWAPPED").order(order.getId())
                .text("Покупатель заменил приз кейса «" + swapped.won().title() + "» на промокод −"
                        + swapped.swap().amountMinor() / 100 + " ₴"));
        return swapped;
    }

    public record CaseSizeRequest(String variantId) {
    }

    @PostMapping("/orders/{id}/gift-case/size")
    @Operation(summary = "Pick the size of my case prize (a product with sizes) among those in stock while the order "
            + "is being put together; 400 GIFT_CASE_SIZE_UNAVAILABLE when that size is gone or it is too late")
    public OrderGiftDtos.SizeDto chooseGiftCaseSize(@PathVariable String id, @RequestBody CaseSizeRequest req) {
        Order order = ownedOrder(id);
        OrderGiftDtos.SizeDto size = giftCaseService.chooseSize(order.getId(), req.variantId());
        activity.record(ActivityLog.fromRequest("GIFT_CASE_SIZE").order(order.getId())
                .text("Покупатель выбрал размер приза кейса: " + size.name()));
        return size;
    }

    private static String prizeText(OrderGiftDtos.CaseItemDto won) {
        if ("DISCOUNT".equals(won.kind())) {
            return won.discountPercent() > 0 ? "скидка " + won.discountPercent() + " %"
                    : "скидка " + won.discountAmountMinor() / 100 + " ₴";
        }
        return won.title();
    }

    private Order ownedOrder(String id) {
        return customerOrders.ownedBy(id, actor.userId());
    }
}
