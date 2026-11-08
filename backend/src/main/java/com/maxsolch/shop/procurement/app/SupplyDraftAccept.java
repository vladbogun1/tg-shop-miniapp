package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.AdminCards;
import com.maxsolch.shop.catalog.app.AdminProductDto;
import com.maxsolch.shop.catalog.app.AdminProducts;
import com.maxsolch.shop.catalog.app.CardDraft;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.app.NewProductCards;
import com.maxsolch.shop.catalog.app.ProductUpsertRequest;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.ItemRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.SupplierRequest;
import com.maxsolch.shop.procurement.app.SupplierAliases.AliasDto;
import com.maxsolch.shop.procurement.app.SupplierAliases.AliasesRequest;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.AcceptResult;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.SupplyDraftEvents;
import com.maxsolch.shop.procurement.domain.supplyai.CatalogItem;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyPlan;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyPlan.Created;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyPlan.NewProduct;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyPlan.Resolved;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * «Принять» of a checked draft, all in the caller's transaction (any refusal leaves nothing behind): the supplier
 * (found or created), the new products — hidden drafts with stock 0, the proposed price and the AI card (description,
 * characteristics, translations) — the batch itself, the supplier memory for the next invoice. The photos of the
 * cards are fetched after the commit ({@link SupplyDraftAfterCommit}): a slow or dead link must not hold the batch.
 */
@Component
class SupplyDraftAccept {

    private static final int MAX_ALIASES = 500;
    private static final int MAX_PHOTOS = 3;

    private final AdminProducts products;
    private final AdminCards adminCards;
    private final NewProductCards cards;
    private final AdminBatches batches;
    private final SupplierService suppliers;
    private final SupplierAliases aliases;
    private final SupplyDraftCatalog catalog;
    private final SupplyDraftJson json;
    private final DomainEvents events;
    private final Clock clock;
    private final ShopZone zone;

    SupplyDraftAccept(AdminProducts products, AdminCards adminCards, NewProductCards cards, AdminBatches batches,
                      SupplierService suppliers, SupplierAliases aliases, SupplyDraftCatalog catalog,
                      SupplyDraftJson json, DomainEvents events, Clock clock, ShopZone zone) {
        this.products = products;
        this.adminCards = adminCards;
        this.cards = cards;
        this.batches = batches;
        this.suppliers = suppliers;
        this.aliases = aliases;
        this.catalog = catalog;
        this.json = json;
        this.events = events;
        this.clock = clock;
        this.zone = zone;
    }

    AcceptResult accept(SupplyDraft d, DraftState s, boolean money) {
        List<NewProduct> plans = SupplyPlan.newProducts(s.getRows());
        List<String> problems = problems(s, plans);
        if (!problems.isEmpty()) {
            throw new DomainException.BadRequest(ProcurementError.DRAFT_NOT_READY, String.join("; ", problems));
        }
        Long supplierId = supplier(s);
        Map<String, Created> created = new LinkedHashMap<>();
        Map<String, List<String>> photos = new LinkedHashMap<>();
        for (NewProduct p : plans) {
            created.put(p.key(), create(s, p, photos));
        }
        List<Resolved> resolved = SupplyPlan.resolvedLines(s.getRows(), created);
        List<ItemRequest> items = SupplyPlan.mergeLines(resolved).stream()
                .map(m -> new ItemRequest(null, m.productId(), m.variantId(), m.qty(),
                        m.unitPrice() == null ? null : Math.round(m.unitPrice() * 100)))
                .toList();
        long batchId = batches.create(new BatchRequest(title(d, s), supplierId, note(d, s), null, "APPROX", null,
                zone.today(clock).plusWeeks(s.getEtaWeeks()), null, null, s.isPreorderOpen(), s.getCurrency(),
                s.getFxRate(), items), money).id();
        remember(supplierId, resolved);
        d.accepted(batchId, clock.instant());
        events.publish(new SupplyDraftEvents.Accepted(d.getId(), batchId, photos));
        return new AcceptResult(batchId, plans.size());
    }

    /** The same checks as the screen, plus what only the server knows (a title already in the catalog, a leaf). */
    private List<String> problems(DraftState s, List<NewProduct> plans) {
        Map<String, Double> prices = new LinkedHashMap<>();
        for (NewProduct p : plans) {
            Long price = s.getPrices().get(SupplyDraftCards.keyOf(p, s));
            prices.put(p.key(), price == null ? null : price.doubleValue());
        }
        List<String> out = new ArrayList<>(SupplyPlan.problems(s.getRows(), plans, prices));
        if (s.getCurrency() == null) {
            out.add("выберите валюту накладной");
        }
        if (s.getFxRate() == null) {
            out.add("введите курс");
        }
        Set<String> taken = catalog.items().stream().map(CatalogItem::title).filter(Objects::nonNull)
                .map(t -> t.trim().toLowerCase(Locale.ROOT)).collect(Collectors.toSet());
        for (NewProduct p : plans) {
            if (taken.contains(p.title().trim().toLowerCase(Locale.ROOT))) {
                out.add("«" + p.title() + "» уже есть в каталоге — выберите его или переименуйте новый");
            }
            if (p.categoryId() != null && !p.categoryId().isEmpty() && !catalog.isLeaf(p.categoryId())) {
                out.add("«" + p.title() + "»: выберите конечную категорию");
            }
        }
        return out;
    }

    private Long supplier(DraftState s) {
        if (s.getSupplierId() != null) {
            return s.getSupplierId();
        }
        if (s.getSupplierName() == null || s.getSupplierName().isBlank()) {
            return null;
        }
        String name = s.getSupplierName().trim();
        return suppliers.suppliers().stream().filter(x -> x.name().equalsIgnoreCase(name)).map(BatchDtos.SupplierDto::id)
                .findFirst()
                .orElseGet(() -> suppliers.createSupplier(new SupplierRequest(name, "Создан «Поставкой с ИИ»")).id());
    }

    private Created create(DraftState s, NewProduct p, Map<String, List<String>> photos) {
        String key = SupplyDraftCards.keyOf(p, s);
        long priceUah = s.getPrices().get(key);
        List<ProductUpsertRequest.VariantInput> variants = p.variants().stream()
                .map(v -> new ProductUpsertRequest.VariantInput(null, v, 0, null)).toList();
        AdminProductDto product = products.create(new ProductUpsertRequest(p.title(), null, priceUah * 100, "UAH", 0,
                false, List.of(), variants, null, null, null, null, null, null, p.categoryId(), null, p.brand(), "NEW",
                null, null, "DRAFT"));
        CardDraft card = s.getCards().containsKey(key) ? json.convert(s.getCards().get(key), CardDraft.class) : null;
        if (card != null) {
            String aiTitle = card.title() == null ? null : card.title().get("ru");
            boolean keepAiTitle = aiTitle != null && aiTitle.trim().equals(p.title().trim());
            adminCards.importCards(new CardsImportRequest(List.of(cards.toImportItem(product.id(), card, keepAiTitle)), true));
            if (card.photos() != null && !card.photos().isEmpty()) {
                photos.put(product.id(), card.photos().stream().limit(MAX_PHOTOS).toList());
            }
        }
        List<CatalogItem.Variant> made = product.variants() == null ? List.of()
                : product.variants().stream().map(v -> new CatalogItem.Variant(v.id(), v.name())).toList();
        return new Created(product.id(), made);
    }

    private void remember(Long supplierId, List<Resolved> resolved) {
        if (supplierId == null) {
            return;
        }
        Map<String, AliasDto> unique = new LinkedHashMap<>();
        SupplyPlan.aliasesOf(resolved).forEach(a -> unique.put(a.sourceKey(), new AliasDto(a.sourceKey(), a.productId(), a.variantId())));
        List<AliasDto> list = unique.values().stream().filter(a -> a.sourceKey() != null && !a.sourceKey().isBlank())
                .limit(MAX_ALIASES).toList();
        if (!list.isEmpty()) {
            aliases.save(supplierId, new AliasesRequest(list));
        }
    }

    private static String title(SupplyDraft d, DraftState s) {
        return s.getTitle() == null || s.getTitle().isBlank() ? "Поставка с ИИ #" + d.getId() : s.getTitle();
    }

    private static String note(SupplyDraft d, DraftState s) {
        List<String> parts = new ArrayList<>();
        if (s.getDoc() != null && s.getDoc().docNo() != null && !s.getDoc().docNo().isBlank()) {
            parts.add("Документ " + s.getDoc().docNo());
        }
        if (s.getDoc() != null && s.getDoc().docDate() != null && !s.getDoc().docDate().isBlank()) {
            parts.add(s.getDoc().docDate());
        }
        parts.add("создано «Поставкой с ИИ» (черновик #" + d.getId() + ")");
        return String.join(" · ", parts);
    }
}
