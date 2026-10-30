package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.translation.app.StoredTranslations;
import com.maxsolch.shop.translation.domain.TranslationsChanged;
import java.time.Clock;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.catalog.domain.Brand;
import com.maxsolch.shop.catalog.domain.CardStatus;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.ProductCondition;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.catalog.domain.SpecsValidator;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardAcceptRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardIssue;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardItemResult;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardRejected;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportResult;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/**
 * The import of an AI answer into «Карточки» (docs/CATALOG-SPECS.md §3.4) and the admin's «Принять» from the review
 * panel: characteristics with confidence, brand, category, description, title and uk/en translations, publishing.
 * The server re-validates everything; the admin check is UX only. Journal and site refresh are the job of
 * {@link AdminCards}.
 */
@Service
public class CardsImporter {

    public static final int MAX_IMPORT_ITEMS = 500;

    private final ProductRepository productRepository;
    private final CatalogDirectory directory;
    private final BrandAdminService brandService;
    private final CardTranslationsWriter translations;
    private final DomainEvents events;
    private final Clock clock;
    private final CardMeta cardMeta;

    public CardsImporter(ProductRepository productRepository, CatalogDirectory directory,
                         BrandAdminService brandService, StoredTranslations translations,
                         DomainEvents events, Clock clock, CardMeta cardMeta) {
        this.productRepository = productRepository;
        this.directory = directory;
        this.brandService = brandService;
        this.translations = new CardTranslationsWriter(translations, clock);
        this.events = events;
        this.clock = clock;
        this.cardMeta = cardMeta;
    }


    /** What one import run collects over its items. */
    private static final class Run {
        final List<CardRejected> rejected = new ArrayList<>();
        final List<CardIssue> issues = new ArrayList<>();
        final List<String> createdBrands = new ArrayList<>();
        final List<CardItemResult> results = new ArrayList<>();
        int applied;
        boolean anyTranslation;

        CardsImportResult result() {
            return new CardsImportResult(applied, rejected, issues, createdBrands, results);
        }
    }

    /** «Before» / «after» of one item: what {@code card_meta.last} records about the import. */
    private static final class ItemChange {
        final String categoryBefore;
        String categoryAfter;
        final String brandNameBefore;
        String brandNameAfter;
        final Map<String, Object> specsBefore;
        final String titleBefore;
        final String descriptionBefore;
        final Map<String, Object[]> textChanges = new LinkedHashMap<>();
        boolean content;

        ItemChange(CatalogSnapshot s, Product p) {
            CatalogSnapshot.Cat catBefore = s.category(ProductCatalogFields.categoryId(p));
            CatalogSnapshot.BrandInfo brandBefore = s.brand(ProductCatalogFields.brandId(p));
            this.categoryBefore = catBefore == null ? null : catBefore.slug();
            this.categoryAfter = categoryBefore;
            this.brandNameBefore = brandBefore == null ? null : brandBefore.name();
            this.brandNameAfter = brandNameBefore;
            this.specsBefore = SpecsJson.readMap(p.getSpecsJson());
            this.titleBefore = p.getTitle();
            this.descriptionBefore = p.getDescription();
        }
    }

    @Transactional
    public CardsImportResult importCards(CardsImportRequest req, Long adminId) {
        if (req == null || req.items() == null) {
            throw new DomainException.BadRequest(CatalogError.ITEMS_REQUIRED);
        }
        if (req.items().size() > MAX_IMPORT_ITEMS) {
            throw new DomainException.BadRequest(CatalogError.TOO_MANY_ITEMS, String.valueOf(MAX_IMPORT_ITEMS));
        }
        boolean replace = Boolean.TRUE.equals(req.replaceSpecs());
        Run run = new Run();
        for (CardImportItem item : req.items()) {
            if (item == null || item.productId() == null) {
                run.rejected.add(new CardRejected(null, "INVALID_ITEM"));
                continue;
            }
            String pid;
            try {
                pid = CardsService.normalizeId(item.productId().trim());
            } catch (DomainException.BadRequest e) {
                run.rejected.add(new CardRejected(item.productId(), "INVALID_ID"));
                run.results.add(new CardItemResult(item.productId(), false, false, "INVALID_ID", Map.of(), 0));
                continue;
            }
            Product p = productRepository.findByIdForUpdate(UuidUtil.toBytes(pid)).orElse(null);
            if (p == null) {
                run.rejected.add(new CardRejected(pid, "NOT_FOUND"));
                run.results.add(new CardItemResult(pid, false, false, "NOT_FOUND", Map.of(), 0));
                continue;
            }
            applyItem(run, pid, p, item, replace, false, adminId);
        }
        finish(run);
        return run.result();
    }

    /**
     * «Принять» from the review panel: the admin's edits (title / description / specs / uk·en texts,
     * all optional) are applied as the admin's own — translations become MANUAL (over MANUAL ones
     * too), {@code card_meta.last} keeps its «before» and gets the new «after» (edited) — and the
     * card becomes READY (unless {@code ready=false}).
     */
    @Transactional
    public CardsImportResult accept(String productId, CardAcceptRequest req, Long adminId) {
        String pid = CardsService.normalizeId(productId == null ? "" : productId.trim());
        Product p = productRepository.findByIdForUpdate(UuidUtil.toBytes(pid))
                .orElseThrow(() -> new DomainException.NotFound(CatalogError.PRODUCT_NOT_FOUND));
        CardAcceptRequest r = req == null ? new CardAcceptRequest(null, null, null, null, true) : req;
        CardImportItem item = new CardImportItem(pid, null, null, r.specs(), null, null, r.description(), null, null,
                null, !Boolean.FALSE.equals(r.ready()), null, null, r.title(), r.translations(), null, null);
        Run run = new Run();
        // The panel sends the whole edited set: a cleared field is removed.
        applyItem(run, pid, p, item, true, true, adminId);
        finish(run);
        return run.result();
    }

    private void finish(Run run) {
        if (run.anyTranslation) {
            events.publish(new TranslationsChanged());
        }
        directory.evictAll();
    }

    /**
     * Applies one item to a locked product. {@code manual}: the admin's edits (not an AI answer) —
     * translations are MANUAL and {@code card_meta.last} is merged instead of replaced.
     */
    private void applyItem(Run run, String pid, Product p, CardImportItem item, boolean replace, boolean manual,
                           Long adminId) {
        // Brands created by earlier items must be visible: re-read the directory per item.
        CatalogSnapshot s = directory.load();
        // «before» of everything the import may change (card_meta.last)
        ItemChange ch = new ItemChange(s, p);
        applyCategory(run.issues, pid, p, item, s, ch);
        applyBrand(run, p, item, ch);
        applyCondition(run.issues, pid, p, item);
        applyTitle(run.issues, pid, p, item, ch);
        applyDescription(run.issues, pid, p, item, ch);
        applySpecs(run.issues, pid, p, item, s, replace, ch);
        if (!Objects.equals(ch.titleBefore, p.getTitle())) {
            ch.textChanges.put("ru/title", new Object[]{ch.titleBefore, p.getTitle()});
        }
        if (!Objects.equals(ch.descriptionBefore, p.getDescription())) {
            ch.textChanges.put("ru/description", new Object[]{ch.descriptionBefore, p.getDescription()});
        }
        if (Boolean.TRUE.equals(item.markReady())) {
            ProductPublishing.setStatus(p, CardStatus.READY, adminId, clock.instant());
        } else if (ch.content && !manual) {
            p.setCardStatus(CardStatus.AI_FILLED);
        }
        productRepository.save(p);
        productRepository.flush();

        CardTranslationsWriter.Written translated = translations.write(pid, p, item, run.issues, ch.textChanges, manual,
                adminId);
        run.anyTranslation |= translated.any();
        writeCardMeta(p, item, ch, manual);
        publish(run, pid, p, item, translated);
    }

    /** Category (leaf only). */
    private static void applyCategory(List<CardIssue> issues, String pid, Product p, CardImportItem item,
                                      CatalogSnapshot s, ItemChange ch) {
        String catSlug = trimToNull(item.categorySlug());
        if (catSlug == null) {
            return;
        }
        CatalogSnapshot.Cat c = s.categoryBySlug(catSlug);
        if (c == null) {
            issues.add(new CardIssue(pid, "category", "UNKNOWN_CATEGORY", "нет категории «" + catSlug + "»"));
        } else if (!s.isLeaf(c.id())) {
            issues.add(new CardIssue(pid, "category", "CATEGORY_NOT_LEAF",
                    "«" + catSlug + "» — раздел с подкатегориями"));
        } else {
            p.setCategoryId(UuidUtil.toBytes(c.id()));
            ch.categoryAfter = c.slug();
        }
    }

    /** Brand: by name / alias, or created. */
    private void applyBrand(Run run, Product p, CardImportItem item, ItemChange ch) {
        String brandName = trimToNull(item.brand());
        if (brandName == null) {
            return;
        }
        boolean[] created = {false};
        Brand b = brandService.findOrCreate(brandName, created);
        if (b != null) {
            p.setBrandId(b.getId());
            ch.brandNameAfter = b.getName();
            if (created[0]) {
                run.createdBrands.add(b.getName());
            }
        }
    }

    private static void applyCondition(List<CardIssue> issues, String pid, Product p, CardImportItem item) {
        if (item.condition() != null) {
            ProductCondition c = ProductCondition.parse(item.condition());
            if (c == null) {
                issues.add(new CardIssue(pid, "condition", "UNKNOWN_CONDITION", item.condition()));
            } else {
                p.setCondition(c);
            }
        }
        if (item.conditionNote() != null) {
            p.setConditionNote(CardMeta.cut(trimToNull(item.conditionNote()), 255));
        }
    }

    /** Title (ru). */
    private void applyTitle(List<CardIssue> issues, String pid, Product p, CardImportItem item, ItemChange ch) {
        String title = trimToNull(item.title());
        if (title == null || title.equals(p.getTitle())) {
            return;
        }
        if (title.length() > 255) {
            issues.add(new CardIssue(pid, "title", "TOO_LONG", "название длиннее 255 символов"));
        } else if (!title.equalsIgnoreCase(p.getTitle()) && productRepository.existsByTitle(title)) {
            issues.add(new CardIssue(pid, "title", "TITLE_TAKEN", "такое название уже есть"));
        } else {
            p.setTitle(title);
            ch.content = true;
        }
    }

    /** Description (ru) — only when sent. */
    private static void applyDescription(List<CardIssue> issues, String pid, Product p, CardImportItem item,
                                         ItemChange ch) {
        String description = trimToNull(item.description());
        if (description == null) {
            return;
        }
        if (description.length() > 20_000) {
            issues.add(new CardIssue(pid, "description", "TOO_LONG", "описание длиннее 20 000 символов"));
        } else {
            p.setDescription(description);
            ch.content = true;
        }
    }

    /** Specs, validated against the (possibly new) category. */
    private static void applySpecs(List<CardIssue> issues, String pid, Product p, CardImportItem item,
                                   CatalogSnapshot s, boolean replace, ItemChange ch) {
        if (item.specs() == null) {
            return;
        }
        String cid = ProductCatalogFields.categoryId(p);
        SpecsValidator.Result r = SpecsValidator.validate(s.attributesFor(cid), item.specs());
        for (SpecsValidator.Issue i : r.issues()) {
            issues.add(new CardIssue(pid, i.key(), i.reason(), i.message()));
        }
        Map<String, Object> merged = replace ? new LinkedHashMap<>() : new LinkedHashMap<>(ch.specsBefore);
        merged.putAll(r.specs());
        // Keep only what the (current) schema knows, in schema order.
        SpecsValidator.Result clean = SpecsValidator.validate(s.attributesFor(cid), merged);
        p.setSpecsJson(SpecsJson.write(clean.specs()));
        ch.content = true;
    }

    /** Card meta: journal of the AI fill + what this import changed (card_meta.last). */
    private void writeCardMeta(Product p, CardImportItem item, ItemChange ch, boolean manual) {
        boolean ai = item.confidence() != null || item.overall() != null;
        if (!(ch.content || ai || !ch.textChanges.isEmpty())) {
            return;
        }
        Map<String, Object> changed = cardMeta.changes(ch.categoryBefore, ch.categoryAfter, ch.brandNameBefore,
                ch.brandNameAfter, ch.specsBefore, SpecsJson.readMap(p.getSpecsJson()), ch.textChanges, item);
        Map<String, Object> meta = manual ? SpecsJson.readMap(p.getCardMetaJson()) : cardMeta.meta(p, item);
        // An AI import replaces the snapshot (no history kept); the admin's edits are merged into it.
        meta.put("last", manual ? cardMeta.mergeLast(meta.get("last"), changed) : cardMeta.lastOf(changed, item));
        p.setCardMetaJson(SpecsJson.write(meta));
        if (item.overall() != null) {
            p.setCardConfidence(Math.max(0, Math.min(100, item.overall())));
        }
        productRepository.save(p);
    }

    /** Publishing, then the item's result. */
    private void publish(Run run, String pid, Product p, CardImportItem item,
                         CardTranslationsWriter.Written translated) {
        boolean published = p.isActive();
        String reason = null;
        if (Boolean.TRUE.equals(item.publish()) && !p.isActive()) {
            List<String> missing = ProductPublishing.missingForPublish(p);
            if (!missing.isEmpty()) {
                reason = "NOT_PUBLISHABLE: " + String.join(",", missing);
            } else if (CardsService.status(p) == CardStatus.DRAFT) {
                reason = CatalogError.CARD_NOT_READY.code();
            } else {
                p.setActive(true);
                ProductPublishing.syncUnfinished(p);
                productRepository.save(p);
                published = true;
            }
        }
        run.applied++;
        run.results.add(new CardItemResult(pid, true, published, reason, translated.perLocale(),
                translated.skippedManual()));
    }

}
