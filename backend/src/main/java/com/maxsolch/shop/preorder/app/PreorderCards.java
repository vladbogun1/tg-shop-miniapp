package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.preorder.app.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.preorder.domain.PreorderSubscription;
import com.maxsolch.shop.preorder.domain.PreorderSubscription.Status;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.procurement.app.BatchCatalog;
import com.maxsolch.shop.procurement.app.BatchDtos.EtaDto;
import com.maxsolch.shop.procurement.domain.BatchEta;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.translation.app.TranslationService;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

/**
 * A queue place as the customer sees it ({@link MyPreorderDto}): the product and variant names in their
 * language, the position, the ETA of the soonest open batch. Runs in the caller's transaction.
 */
@Component
class PreorderCards {

    private final PreorderSubscriptionRepository subs;
    private final BatchCatalog batches;
    private final Products products;
    private final TranslationService translations;
    private final Clock clock;
    private final ShopZone shopZone;

    PreorderCards(PreorderSubscriptionRepository subs, BatchCatalog batches, Products products,
                  TranslationService translations, Clock clock, ShopZone shopZone) {
        this.subs = subs;
        this.batches = batches;
        this.products = products;
        this.translations = translations;
        this.clock = clock;
        this.shopZone = shopZone;
    }

    /** ETA of the soonest open public batch per line. */
    Map<String, EtaDto> openEtas() {
        Map<String, PreorderBatch> best = new HashMap<>();
        for (BatchCatalog.PublicLine row : batches.publicLines()) {
            PreorderBatchItem i = row.item();
            best.merge(Lines.key(i.getProductId(), i.getVariantId()), row.batch(), BatchEta::sooner);
        }
        LocalDate today = shopZone.today(clock);
        Map<String, EtaDto> out = new HashMap<>();
        best.forEach((k, b) -> out.put(k, BatchCatalog.eta(b, today)));
        return out;
    }

    EtaDto openEta(byte[] productId, byte[] variantId) {
        PreorderBatch best = null;
        for (BatchCatalog.PublicLine row : batches.publicLines(productId)) {
            if (Arrays.equals(row.item().getVariantId(), variantId)) {
                best = best == null ? row.batch() : BatchEta.sooner(best, row.batch());
            }
        }
        return best == null ? null : BatchCatalog.eta(best, shopZone.today(clock));
    }

    MyPreorderDto toMine(PreorderSubscription s, Product p, EtaDto eta) {
        return toMine(s, p, eta, ContentLocale.normalize(LocaleContextHolder.getLocale()));
    }

    /** {@code lang}: the product and variant names come in it (uk/en translations; ru is the source). */
    MyPreorderDto toMine(PreorderSubscription s, Product p, EtaDto eta, String lang) {
        Integer position = null;
        if (s.statusEnum() == Status.WAITING) {
            position = (int) subs.countAhead(s.getProductId(), s.getVariantId(), s.getCreatedAt(), s.getId()) + 1;
        }
        ProductVariant v = Lines.variantById(p, s.getVariantId());
        String productId = UuidUtil.toString(s.getProductId());
        String variantId = s.getVariantId() == null ? null : UuidUtil.toString(s.getVariantId());
        TranslationService.Overlay overlay = translations.overlay(lang);
        String title = overlay == null ? p.getTitle()
                : overlay.text(TranslationEntityType.PRODUCT, productId, TranslationEntityType.TITLE, p.getTitle());
        String variantName = v == null ? null : overlay == null ? v.getName()
                : overlay.text(TranslationEntityType.VARIANT, variantId, TranslationEntityType.NAME, v.getName());
        return new MyPreorderDto(s.getId(), productId, variantId,
                title, p.getSlug(), Lines.imageOf(p), variantName, s.getQty(), s.getStatus(),
                position, s.getHeldQty(), s.getHoldUntil(), s.getCreatedAt(),
                s.statusEnum().live() ? eta : null);
    }

    Map<String, Product> productsOf(Collection<byte[]> ids) {
        Map<String, Product> out = new HashMap<>();
        if (ids.isEmpty()) {
            return out;
        }
        for (Product p : products.findAllById(ids)) {
            out.put(UuidUtil.toString(p.getId()), p);
        }
        return out;
    }
}
