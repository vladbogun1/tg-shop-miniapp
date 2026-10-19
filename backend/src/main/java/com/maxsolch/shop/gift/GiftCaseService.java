package com.maxsolch.shop.gift;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.gift.GiftDtos.CaseItemDto;
import com.maxsolch.shop.gift.GiftDtos.CaseOpenDto;
import com.maxsolch.shop.gift.GiftDtos.OrderGiftDto;
import com.maxsolch.shop.gift.GiftDtos.PromoDto;
import com.maxsolch.shop.gift.GiftDtos.SizeDto;
import com.maxsolch.shop.gift.GiftDtos.SizeOption;
import com.maxsolch.shop.gift.GiftDtos.SwapDto;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.service.OrderEvents;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The gift case of an order (docs/GIFT-CASE.md). The prize was drawn at checkout (OrderService) and
 * already sits in the order; opening reveals it (a discount prize gets its personal code now), and a
 * product prize similar to what the customer bought may be swapped for a code.
 */
@Service
public class GiftCaseService {

    private final OrderService orderService;
    private final GiftService giftService;
    private final CatalogService catalogService;
    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    public GiftCaseService(OrderService orderService, GiftService giftService, CatalogService catalogService,
                           JdbcTemplate jdbc, ApplicationEventPublisher events) {
        this.orderService = orderService;
        this.giftService = giftService;
        this.catalogService = catalogService;
        this.jdbc = jdbc;
        this.events = events;
    }

    /** POST …/gift-case/open: SEALED → OPENED once, only paid; a discount prize gets its code. */
    @Transactional
    public CaseOpenDto open(byte[] orderId, String lang) {
        Order order = orderService.openGiftCase(orderId);
        OrderGiftCase rec = giftService.orderCase(orderId).orElse(null);
        if (rec != null && rec.isDiscount() && rec.getPromoCode() == null) {
            PromoCode promo = giftService.issuePromo(order.getUserId(), orderId, rec.getTier(), rec.getDiscountPercent(),
                    rec.getDiscountAmountMinor());
            rec.setPromoCode(promo.getCode());
            rec = giftService.saveOrderCase(rec);
            // Issued just now, so it is told once: the bot DMs the code after the commit.
            events.publishEvent(new OrderEvents.GiftCasePromo(orderId, promo.getCode(),
                    promo.getDiscountPercent(), promo.getDiscountAmountMinor(), promo.getExpiresAt()));
        }
        return openDto(order, rec, lang);
    }

    /**
     * POST …/gift-case/swap: the product prize is similar to what the customer bought — it leaves the
     * order (back to stock) and a fixed-amount code of the tier's swap percent comes instead. Once.
     */
    @Transactional
    public CaseOpenDto swap(byte[] orderId, String lang) {
        Order order = orderService.lockForGiftCase(orderId);
        OrderGiftCase rec = giftService.orderCase(orderId).orElseThrow(GiftCaseService::swapUnavailable);
        SwapDto offer = swapOffer(order, rec);
        if (!offer.available()) {
            throw swapUnavailable();
        }
        Order saved = orderService.removeCasePrizeForSwap(orderId);
        PromoCode promo = giftService.issuePromo(order.getUserId(), orderId, rec.getTier(), 0, offer.amountMinor());
        rec.setPromoCode(promo.getCode());
        rec.setSwappedAt(Instant.now());
        rec.setSwapAmountMinor(offer.amountMinor());
        rec = giftService.saveOrderCase(rec);
        return openDto(saved, rec, lang);
    }

    private static BadRequestException swapUnavailable() {
        return new BadRequestException("Заменить приз уже нельзя", OrderService.GIFT_CASE_SWAP_UNAVAILABLE);
    }

    /** The gift block of an order page; {@code customer}: the prize stays hidden until the case is opened. */
    @Transactional(readOnly = true)
    public OrderGiftDto orderGift(Order order, String lang, boolean customer) {
        if (order.getGiftTier() == null && order.getGiftCaseStatus() == null) {
            return null;
        }
        OrderGiftCase rec = order.getGiftCaseStatus() == null ? null : giftService.orderCase(order.getId()).orElse(null);
        boolean hidden = customer && !OrderService.GIFT_CASE_OPENED.equals(order.getGiftCaseStatus());
        CaseItemDto prize = rec == null || hidden ? null : wonDto(rec, lang);
        PromoDto promo = rec == null || hidden ? null : promoDto(rec.getPromoCode());
        SwapDto swap = rec == null || hidden ? null : swapOffer(order, rec);
        SizeDto size = order.getGiftCaseStatus() == null || hidden ? null : sizeDto(order);
        return new OrderGiftDto(order.getGiftTier(), order.getGiftDiscountMinor(), order.getGiftCaseStatus(),
                OrderService.giftCaseOpenable(order), prize, promo, swap, size,
                customer || rec == null ? null : rec.isLowMargin());
    }

    /** POST …/gift-case/size: the customer picks the size of the product prize (the hold moves to it). */
    @Transactional
    public SizeDto chooseSize(byte[] orderId, String variantId) {
        return sizeDto(orderService.chooseCasePrizeSize(orderId, variantId));
    }

    /** The size block of the case prize line; null when the prize has no sizes or has left the order. */
    SizeDto sizeDto(Order order) {
        var line = OrderService.casePrizeLine(order).orElse(null);
        if (line == null || line.getVariantId() == null) {
            return null;
        }
        List<OrderService.PrizeSize> sizes = orderService.casePrizeSizes(order);
        if (sizes.isEmpty()) {
            return null;
        }
        return new SizeDto(line.isVariantPending(), OrderService.giftCaseSwappable(order),
                UuidUtil.toString(line.getVariantId()), line.getVariantNameSnapshot(),
                sizes.stream().map(s -> new SizeOption(s.variantId(), s.name())).toList());
    }

    private CaseOpenDto openDto(Order order, OrderGiftCase rec, String lang) {
        String tier = rec != null ? rec.getTier() : order.getGiftTier();
        CaseItemDto won = rec != null ? wonDto(rec, lang) : legacyWon(order, lang);
        List<CaseItemDto> reel = new ArrayList<>(giftService.casePrizes(tier, lang));
        if (reel.stream().noneMatch(c -> c.key().equals(won.key()))) {
            reel.add(won);
        }
        return new CaseOpenDto(OrderService.GIFT_CASE_OPENED, tier, won, reel,
                rec == null ? null : promoDto(rec.getPromoCode()),
                rec == null ? new SwapDto(false, 0, null) : swapOffer(order, rec), sizeDto(order));
    }

    /** What dropped, for the customer's language (the product as it is in the catalog now). */
    private CaseItemDto wonDto(OrderGiftCase rec, String lang) {
        if (rec.isDiscount()) {
            return new CaseItemDto("d" + rec.getCaseItemId(), GiftCaseItem.Kind.DISCOUNT.name(), null, null, null, 0,
                    rec.getRarity(), rec.getDiscountPercent(), rec.getDiscountAmountMinor());
        }
        String pid = rec.getProductId() == null ? null : UuidUtil.toString(rec.getProductId());
        ProductDto p = pid == null ? null : catalogService.getProduct(pid, lang).orElse(null);
        return new CaseItemDto("p" + pid, GiftCaseItem.Kind.PRODUCT.name(), pid,
                p != null ? p.title() : rec.getTitle(), GiftService.image(p), p != null ? p.priceMinor() : 0,
                rec.getRarity(), 0, 0);
    }

    /** An order sealed before the prize records existed: the prize line is all there is. */
    private CaseItemDto legacyWon(Order order, String lang) {
        var line = OrderService.casePrizeLine(order).orElseThrow(
                () -> new BadRequestException("в заказе нет приза кейса", OrderService.GIFT_CASE_NONE));
        String pid = UuidUtil.toString(line.getProductId());
        ProductDto p = catalogService.getProduct(pid, lang).orElse(null);
        return new CaseItemDto("p" + pid, GiftCaseItem.Kind.PRODUCT.name(), pid,
                p != null ? p.title() : line.getTitleSnapshot(), GiftService.image(p), p != null ? p.priceMinor() : 0,
                line.getCaseRarity(), 0, 0);
    }

    private PromoDto promoDto(String code) {
        Optional<PromoCode> p = giftService.promo(code);
        return p.map(c -> new PromoDto(c.getCode(), c.getDiscountPercent(), c.getDiscountAmountMinor(),
                c.getExpiresAt(), c.getUsesCount() > 0 || !c.isActive())).orElse(null);
    }

    /**
     * The swap offer of a product prize: the order is still being put together, the prize is still in
     * it, the tier swaps ({@code swap_percent} &gt; 0) and the customer already has something similar —
     * the same product or one of the same category in any of their orders (this one included).
     */
    SwapDto swapOffer(Order order, OrderGiftCase rec) {
        if (rec.getSwappedAt() != null) {
            return new SwapDto(false, rec.getSwapAmountMinor(), rec.getSwappedAt());
        }
        if (rec.isDiscount() || rec.getProductId() == null || !OrderService.giftCaseSwappable(order)) {
            return new SwapDto(false, 0, null);
        }
        long price = catalogService.getProduct(UuidUtil.toString(rec.getProductId()), "ru")
                .map(ProductDto::priceMinor).orElse(0L);
        long amount = giftService.tierSettings(rec.getTier()).map(t -> t.swapAmountMinor(price)).orElse(0L);
        if (amount <= 0 || !similarBought(order, rec.getProductId())) {
            return new SwapDto(false, 0, null);
        }
        return new SwapDto(true, amount, null);
    }

    private boolean similarBought(Order order, byte[] prizeProductId) {
        Boolean found = jdbc.queryForObject("""
                select exists(
                  select 1
                    from order_items i
                    join orders o on o.id = i.order_id
                    join products p on p.id = i.product_id
                    join products q on q.id = ?
                   where (o.id = ? or (? is not null and o.user_id = ?))
                     and o.status <> 'REJECTED'
                     and i.gift = 0
                     and (i.product_id = q.id or (p.category_id is not null and p.category_id = q.category_id)))
                """, Boolean.class, prizeProductId, order.getId(), order.getUserId(), order.getUserId());
        return Boolean.TRUE.equals(found);
    }
}
