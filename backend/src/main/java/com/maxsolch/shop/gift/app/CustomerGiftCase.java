package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.order.app.CustomerOrders;
import com.maxsolch.shop.order.app.OrderGiftDtos;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.platform.journal.ActivityLog;
import org.springframework.stereotype.Service;

/** What the customer does with the gift case of their own order; each step is noted in the journal. */
@Service
public class CustomerGiftCase {

    private final CustomerOrders customerOrders;
    private final GiftCaseService giftCaseService;
    private final ActivityLog activity;

    public CustomerGiftCase(CustomerOrders customerOrders, GiftCaseService giftCaseService, ActivityLog activity) {
        this.customerOrders = customerOrders;
        this.giftCaseService = giftCaseService;
        this.activity = activity;
    }

    public GiftDtos.CaseOpenDto open(String orderId, long userId, String lang) {
        Order order = customerOrders.ownedBy(orderId, userId);
        GiftDtos.CaseOpenDto opened = giftCaseService.open(order.getId(), lang);
        activity.record(activity.fromRequest("GIFT_CASE_OPENED").order(order.getId())
                .text("Покупатель открыл кейс (" + opened.tier() + "): " + prizeText(opened.won())
                        + " (" + opened.won().rarity() + ")"));
        return opened;
    }

    public GiftDtos.CaseOpenDto swap(String orderId, long userId, String lang) {
        Order order = customerOrders.ownedBy(orderId, userId);
        GiftDtos.CaseOpenDto swapped = giftCaseService.swap(order.getId(), lang);
        activity.record(activity.fromRequest("GIFT_CASE_SWAPPED").order(order.getId())
                .text("Покупатель заменил приз кейса «" + swapped.won().title() + "» на промокод −"
                        + swapped.swap().amountMinor() / 100 + " ₴"));
        return swapped;
    }

    public OrderGiftDtos.SizeDto chooseSize(String orderId, long userId, String variantId) {
        Order order = customerOrders.ownedBy(orderId, userId);
        OrderGiftDtos.SizeDto size = giftCaseService.chooseSize(order.getId(), variantId);
        activity.record(activity.fromRequest("GIFT_CASE_SIZE").order(order.getId())
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
}
