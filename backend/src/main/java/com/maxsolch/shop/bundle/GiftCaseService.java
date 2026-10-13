package com.maxsolch.shop.bundle;

import com.maxsolch.shop.bundle.BundleDtos.CaseItemDto;
import com.maxsolch.shop.bundle.BundleDtos.CaseOpenDto;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.web.dto.ProductDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Opening the gift case of an order. The prize was drawn at checkout (OrderService.createOrder) and
 * already sits in the order; opening only reveals it and hands the client the prizes for the reel.
 */
@Service
public class GiftCaseService {

    private final OrderService orderService;
    private final BundleService bundleService;
    private final CatalogService catalogService;

    public GiftCaseService(OrderService orderService, BundleService bundleService, CatalogService catalogService) {
        this.orderService = orderService;
        this.bundleService = bundleService;
        this.catalogService = catalogService;
    }

    @Transactional
    public CaseOpenDto open(byte[] orderId, String lang) {
        OrderItem prize = orderService.openGiftCase(orderId);
        String productId = UuidUtil.toString(prize.getProductId());
        List<CaseItemDto> reel = new ArrayList<>(bundleService.casePrizes(lang));
        CaseItemDto won = reel.stream().filter(c -> c.productId().equals(productId)).findFirst()
                .map(c -> new CaseItemDto(c.productId(), c.title(), c.imageUrl(), c.priceMinor(), prize.getCaseRarity(),
                        c.chancePercent()))
                .orElseGet(() -> {
                    // The prize ran out (or left the case) since checkout: still show it, from the catalog.
                    ProductDto p = catalogService.getProduct(productId, lang).orElse(null);
                    String title = p != null ? p.title() : prize.getTitleSnapshot();
                    String img = p == null || p.images() == null || p.images().isEmpty() ? null : p.images().get(0).url();
                    long price = p != null ? p.priceMinor() : 0;
                    return new CaseItemDto(productId, title, img, price, prize.getCaseRarity(), 0);
                });
        if (reel.stream().noneMatch(c -> c.productId().equals(productId))) {
            reel.add(won);
        }
        return new CaseOpenDto(OrderService.GIFT_CASE_OPENED, won, reel);
    }
}
