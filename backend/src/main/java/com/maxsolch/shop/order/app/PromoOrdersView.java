package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.app.PromoAdminService;
import com.maxsolch.shop.promo.domain.PromoOrigin;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Where promo codes went: the admin pages «Заказы с кодом» and «Персональные скидки». The promo module is below
 * order, so the order module serves these.
 */
@Service
public class PromoOrdersView {

    /** An order placed with the code (the «Заказы с кодом» list). */
    public record PromoOrderDto(
            String id,
            String status,
            String customerName,
            long totalMinor,
            long discountMinor,
            Instant createdAt) {
    }

    /** An order with a manual amount/percent discount (the «Персональные скидки» tab). */
    public record ManualDiscountDto(
            String id,
            String status,
            String customerName,
            Long tgUserId,
            /** The label as stored: «Ручная скидка» or «Ручная скидка 10%». */
            String label,
            long totalMinor,
            long discountMinor,
            Instant createdAt) {
    }

    private final OrderRepository orderRepository;
    private final PromoAdminService promos;

    public PromoOrdersView(OrderRepository orderRepository, PromoAdminService promos) {
        this.orderRepository = orderRepository;
        this.promos = promos;
    }

    /** Orders placed with the code of the URL, newest first (max 100). */
    @Transactional(readOnly = true)
    public List<PromoOrderDto> ordersWithCode(String promoId) {
        String code = promos.get(promoId).getCode();
        return orderRepository.ordersWithPromoCode(code, PageRequest.of(0, 100)).stream()
                .map(o -> new PromoOrderDto(UuidUtil.toString(o.getId()), statusOf(o), o.getCustomerName(),
                        o.getTotalMinor(), o.getDiscountMinor(), o.getCreatedAt()))
                .toList();
    }

    /** Orders with a manual amount/percent discount, newest first (max 200). */
    @Transactional(readOnly = true)
    public List<ManualDiscountDto> manualDiscounts() {
        return orderRepository.ordersWithManualDiscount(PromoOrigin.MANUAL_DISCOUNT_LABEL, PageRequest.of(0, 200))
                .stream()
                .map(o -> new ManualDiscountDto(UuidUtil.toString(o.getId()), statusOf(o), o.getCustomerName(),
                        o.getUserId(), o.getPromoCode(), o.getTotalMinor(), o.getDiscountMinor(), o.getCreatedAt()))
                .toList();
    }

    private static String statusOf(Order o) {
        return o.getStatus() == null ? null : o.getStatus().name();
    }
}
