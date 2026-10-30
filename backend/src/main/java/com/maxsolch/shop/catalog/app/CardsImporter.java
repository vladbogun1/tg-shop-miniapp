package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.translation.app.StoredTranslations;
import com.maxsolch.shop.translation.domain.TranslationsChanged;
import java.time.Clock;
import com.maxsolch.shop.catalog.domain.CatalogErrors;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.catalog.domain.Brand;
import com.maxsolch.shop.catalog.domain.CardStatus;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.ProductCondition;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.catalog.domain.SpecsValidator;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardAcceptRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardExportItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardIssue;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardItemResult;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardRejected;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardReview;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardTextState;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardTranslation;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportResult;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsStats;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.ContentTranslationId;
import com.maxsolch.shop.translation.infra.ContentTranslationRepository;
import com.maxsolch.shop.translation.app.TranslationLimits;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import com.maxsolch.shop.translation.app.TranslationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

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
    private final StoredTranslations translations;
    private final DomainEvents events;
    private final Clock clock;
    private final CardMeta cardMeta;

    public CardsImporter(ProductRepository productRepository, CatalogDirectory directory,
                         BrandAdminService brandService, StoredTranslations translations,
                         DomainEvents events, Clock clock, CardMeta cardMeta) {
        this.productRepository = productRepository;
        this.directory = directory;
        this.brandService = brandService;
        this.translations = translations;
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

    @Transactional
    public CardsImportResult importCards(CardsImportRequest req, Long adminId) {
        if (req == null || req.items() == null) {
            throw CatalogErrors.badRequest("items required");
        }
        if (req.items().size() > MAX_IMPORT_ITEMS) {
            throw CatalogErrors.badRequest("too many items (max " + MAX_IMPORT_ITEMS + ")");
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
                .orElseThrow(() -> CatalogErrors.notFound("product not found"));
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
        List<CardIssue> issues = run.issues;
        // Brands created by earlier items must be visible: re-read the directory per item.
        CatalogSnapshot s = directory.load();
        boolean content = false;

        // «before» of everything the import may change (card_meta.last)
        CatalogSnapshot.Cat catBefore = s.category(ProductCatalogFields.categoryId(p));
        CatalogSnapshot.BrandInfo brandBefore = s.brand(ProductCatalogFields.brandId(p));
        String categoryBefore = catBefore == null ? null : catBefore.slug();
        String categoryAfter = categoryBefore;
        String brandNameBefore = brandBefore == null ? null : brandBefore.name();
        String brandNameAfter = brandNameBefore;
        Map<String, Object> specsBefore = SpecsJson.readMap(p.getSpecsJson());
        String titleBefore = p.getTitle();
        String descriptionBefore = p.getDescription();
        Map<String, Object[]> textChanges = new LinkedHashMap<>();

        // category (leaf only)
        String catSlug = trimToNull(item.categorySlug());
        if (catSlug != null) {
            CatalogSnapshot.Cat c = s.categoryBySlug(catSlug);
            if (c == null) {
                issues.add(new CardIssue(pid, "category", "UNKNOWN_CATEGORY", "нет категории «" + catSlug + "»"));
            } else if (!s.isLeaf(c.id())) {
                issues.add(new CardIssue(pid, "category", "CATEGORY_NOT_LEAF",
                        "«" + catSlug + "» — раздел с подкатегориями"));
            } else {
                p.setCategoryId(UuidUtil.toBytes(c.id()));
                categoryAfter = c.slug();
            }
        }
        // brand: by name / alias, or created
        String brandName = trimToNull(item.brand());
        if (brandName != null) {
            boolean[] created = {false};
            Brand b = brandService.findOrCreate(brandName, created);
            if (b != null) {
                p.setBrandId(b.getId());
                brandNameAfter = b.getName();
                if (created[0]) {
                    run.createdBrands.add(b.getName());
                }
            }
        }
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
        // title (ru)
        String title = trimToNull(item.title());
        if (title != null && !title.equals(p.getTitle())) {
            if (title.length() > 255) {
                issues.add(new CardIssue(pid, "title", "TOO_LONG", "название длиннее 255 символов"));
            } else if (!title.equalsIgnoreCase(p.getTitle()) && productRepository.existsByTitle(title)) {
                issues.add(new CardIssue(pid, "title", "TITLE_TAKEN", "такое название уже есть"));
            } else {
                p.setTitle(title);
                content = true;
            }
        }
        // description (ru) — only when sent
        String description = trimToNull(item.description());
        if (description != null) {
            if (description.length() > 20_000) {
                issues.add(new CardIssue(pid, "description", "TOO_LONG", "описание длиннее 20 000 символов"));
            } else {
                p.setDescription(description);
                content = true;
            }
        }
        // specs, validated against the (possibly new) category
        String cid = ProductCatalogFields.categoryId(p);
        if (item.specs() != null) {
            SpecsValidator.Result r = SpecsValidator.validate(s.attributesFor(cid), item.specs());
            for (SpecsValidator.Issue i : r.issues()) {
                issues.add(new CardIssue(pid, i.key(), i.reason(), i.message()));
            }
            Map<String, Object> merged = replace ? new LinkedHashMap<>() : new LinkedHashMap<>(specsBefore);
            merged.putAll(r.specs());
            // Keep only what the (current) schema knows, in schema order.
            SpecsValidator.Result clean = SpecsValidator.validate(s.attributesFor(cid), merged);
            p.setSpecsJson(SpecsJson.write(clean.specs()));
            content = true;
        }
        if (!Objects.equals(titleBefore, p.getTitle())) {
            textChanges.put("ru/title", new Object[]{titleBefore, p.getTitle()});
        }
        if (!Objects.equals(descriptionBefore, p.getDescription())) {
            textChanges.put("ru/description", new Object[]{descriptionBefore, p.getDescription()});
        }
        if (Boolean.TRUE.equals(item.markReady())) {
            AdminProductService.setStatus(p, CardStatus.READY, adminId, clock.instant());
        } else if (content && !manual) {
            p.setCardStatus(CardStatus.AI_FILLED);
        }
        productRepository.save(p);
        productRepository.flush();

        // translations of the resulting Russian sources
        Map<String, Integer> translated = new LinkedHashMap<>();
        int skippedManual = 0;
        if (item.translations() != null) {
            for (Map.Entry<String, CardTranslation> e : item.translations().entrySet()) {
                String locale = e.getKey() == null ? "" : e.getKey().trim().toLowerCase(Locale.ROOT);
                if (!ContentLocale.TRANSLATED.contains(locale) || e.getValue() == null) {
                    issues.add(new CardIssue(pid, "translations." + e.getKey(), "INVALID_LOCALE",
                            "язык перевода: uk или en"));
                    continue;
                }
                CardTranslation t = e.getValue();
                Tr tr = new Tr(pid, p, locale, new int[]{0, 0}, issues, textChanges, manual, adminId);
                writeTranslation(tr, TranslationEntityType.TITLE, p.getTitle(), t.title());
                writeTranslation(tr, TranslationEntityType.DESCRIPTION, p.getDescription(), t.description());
                writeTranslation(tr, TranslationEntityType.CONDITION_NOTE, p.getConditionNote(), t.conditionNote());
                translated.put(locale, tr.counts()[0]);
                skippedManual += tr.counts()[1];
                run.anyTranslation |= tr.counts()[0] > 0;
            }
        }

        // card meta: journal of the AI fill + what this import changed (card_meta.last)
        boolean ai = item.confidence() != null || item.overall() != null;
        if (content || ai || !textChanges.isEmpty()) {
            Map<String, Object> changed = cardMeta.changes(categoryBefore, categoryAfter, brandNameBefore, brandNameAfter,
                    specsBefore, SpecsJson.readMap(p.getSpecsJson()), textChanges, item);
            Map<String, Object> meta = manual ? SpecsJson.readMap(p.getCardMetaJson()) : cardMeta.meta(p, item);
            // An AI import replaces the snapshot (no history kept); the admin's edits are merged into it.
            meta.put("last", manual ? cardMeta.mergeLast(meta.get("last"), changed) : cardMeta.lastOf(changed, item));
            p.setCardMetaJson(SpecsJson.write(meta));
            if (item.overall() != null) {
                p.setCardConfidence(Math.max(0, Math.min(100, item.overall())));
            }
            productRepository.save(p);
        }

        // publishing
        boolean published = p.isActive();
        String reason = null;
        if (Boolean.TRUE.equals(item.publish()) && !p.isActive()) {
            List<String> missing = AdminProductService.missingForPublish(p);
            if (!missing.isEmpty()) {
                reason = "NOT_PUBLISHABLE: " + String.join(",", missing);
            } else if (CardsService.status(p) == CardStatus.DRAFT) {
                reason = AdminProductService.CARD_NOT_READY;
            } else {
                p.setActive(true);
                AdminProductService.syncUnfinished(p);
                productRepository.save(p);
                published = true;
            }
        }
        run.applied++;
        run.results.add(new CardItemResult(pid, true, published, reason, translated, skippedManual));
    }


    /** Context of the translations of one language of one item. */
    private record Tr(String pid, Product p, String locale, int[] counts, List<CardIssue> issues,
                      Map<String, Object[]> changes, boolean manual, Long adminId) {
    }

    /**
     * Writes one PRODUCT translation of the current Russian {@code source} (hash of the source as
     * stored). From the AI MANUAL rows are kept; the admin's edit ({@code manual}) is written as
     * MANUAL over anything. counts[0] = written, counts[1] = skipped as MANUAL; a changed text is
     * recorded in {@code changes} for card_meta.last.
     */
    private void writeTranslation(Tr tr, String field, String source, String text) {
        if (text == null) {
            return;
        }
        String key = "translations." + tr.locale() + "." + field;
        if (text.isBlank()) {
            tr.issues().add(new CardIssue(tr.pid(), key, "INVALID_TEXT_BLANK", "пустой перевод"));
            return;
        }
        if (text.length() > TranslationLimits.MAX_TEXT_CHARS
                || text.getBytes(StandardCharsets.UTF_8).length > 65_535) {
            tr.issues().add(new CardIssue(tr.pid(), key, "INVALID_TEXT_TOO_LONG", "перевод слишком длинный"));
            return;
        }
        if (source == null || source.isBlank()) {
            tr.issues().add(new CardIssue(tr.pid(), key, "NO_SOURCE", "нет русского текста для перевода"));
            return;
        }
        StoredTranslations.Stored row = translations
                .find(TranslationEntityType.PRODUCT, tr.p().getId(), field, tr.locale()).orElse(null);
        if (row != null && row.origin() == TranslationOrigin.MANUAL && !tr.manual()) {
            tr.counts()[1]++;
            return;
        }
        String before = row == null ? null : row.text();
        // An admin's accepted text is reviewed; new AI text goes back to «Проверить ИИ» on the «Переводы» screen.
        translations.write(TranslationEntityType.PRODUCT, tr.p().getId(), field, tr.locale(), text, source,
                tr.manual() ? TranslationOrigin.MANUAL : TranslationOrigin.AI,
                tr.manual() ? clock.instant() : null, tr.adminId());
        tr.counts()[0]++;
        if (!text.equals(before)) {
            tr.changes().put(tr.locale() + "/" + CardsService.textKey(field), new Object[]{before, text});
        }
    }

}
