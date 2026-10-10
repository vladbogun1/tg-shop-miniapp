package com.maxsolch.shop.catalog;

import com.maxsolch.shop.catalog.CatalogDtos.CardAcceptRequest;
import com.maxsolch.shop.catalog.CatalogDtos.CardExportItem;
import com.maxsolch.shop.catalog.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.CatalogDtos.CardIssue;
import com.maxsolch.shop.catalog.CatalogDtos.CardItemResult;
import com.maxsolch.shop.catalog.CatalogDtos.CardRejected;
import com.maxsolch.shop.catalog.CatalogDtos.CardReview;
import com.maxsolch.shop.catalog.CatalogDtos.CardTextState;
import com.maxsolch.shop.catalog.CatalogDtos.CardTranslation;
import com.maxsolch.shop.catalog.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.CatalogDtos.CardsImportResult;
import com.maxsolch.shop.catalog.CatalogDtos.CardsStats;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.service.AdminProductService;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.translation.ContentTranslation;
import com.maxsolch.shop.translation.ContentTranslationId;
import com.maxsolch.shop.translation.ContentTranslationRepository;
import com.maxsolch.shop.translation.TranslationAdminService;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationOrigin;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.maxsolch.shop.common.Texts.trimToNull;

/**
 * «Карточки» (docs/CATALOG-SPECS.md §3.4): the AI work queue — stats, export for the prompt, and the
 * import of the AI answer (characteristics with confidence, brand, category, description, title and
 * uk/en translations, publishing). The server re-validates everything; the admin check is UX only.
 */
@Service
public class CardsService {

    public static final int MAX_IMPORT_ITEMS = 500;

    private final ProductRepository productRepository;
    private final CatalogDirectory directory;
    private final BrandAdminService brandService;
    private final ContentTranslationRepository translationRepository;
    private final TranslationService translationService;
    private final AdminUserRepository adminUserRepository;

    public CardsService(ProductRepository productRepository, CatalogDirectory directory,
                        BrandAdminService brandService, ContentTranslationRepository translationRepository,
                        TranslationService translationService, AdminUserRepository adminUserRepository) {
        this.productRepository = productRepository;
        this.directory = directory;
        this.brandService = brandService;
        this.translationRepository = translationRepository;
        this.translationService = translationService;
        this.adminUserRepository = adminUserRepository;
    }

    // ------------------------------------------------------------------ stats / export

    @Transactional(readOnly = true)
    public CardsStats stats() {
        CatalogSnapshot s = directory.snapshot();
        long draft = 0;
        long ai = 0;
        long ready = 0;
        long incomplete = 0;
        long unfinished = 0;
        for (Product p : productRepository.findAllNotArchived()) {
            CardStatus st = status(p);
            switch (st) {
                // «Оформить» (and the nav badge) counts drafts that matter: on the storefront or new hidden ones.
                // Old hidden drafts (~180 retired products) stay reachable via «Витрина: скрытые» but are not work.
                case DRAFT -> {
                    if (p.isActive() || isUnfinished(p)) {
                        draft++;
                    }
                }
                // «Проверить» — the same scope as the screen's default «Витрина: в работе»: an old hidden
                // product the AI once filled is not work, else the badge counts cards the tab does not list.
                case AI_FILLED -> {
                    if (p.isActive() || isUnfinished(p)) {
                        ai++;
                    }
                }
                case READY -> ready++;
            }
            if (isIncomplete(s, p)) {
                incomplete++;
            }
            if (isUnfinished(p)) {
                unfinished++;
            }
        }
        return new CardsStats(draft, ai, ready, incomplete, unfinished);
    }

    static CardStatus status(Product p) {
        return p.getCardStatus() == null ? CardStatus.DRAFT : p.getCardStatus();
    }

    /** Active, not archived, and either no category or a required characteristic missing. */
    static boolean isIncomplete(CatalogSnapshot s, Product p) {
        if (!p.isActive() || p.isArchived()) {
            return false;
        }
        String cid = ProductCatalogFields.categoryId(p);
        return cid == null || s.category(cid) == null
                || !s.missingRequired(cid, ProductCatalogFields.specs(p)).isEmpty();
    }

    /** Created in the admin and never published (V53 flag), not archived. */
    static boolean isUnfinished(Product p) {
        return p.isUnfinished() && !p.isArchived();
    }

    /** {@code status}: draft | ai_filled | ready | incomplete | unfinished | all; {@code ids}: comma-separated. */
    @Transactional(readOnly = true)
    public List<CardExportItem> export(String status, String ids) {
        CatalogSnapshot s = directory.snapshot();
        String st = status == null || status.isBlank() ? "all" : status.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("draft", "ai_filled", "ready", "incomplete", "unfinished", "all").contains(st)) {
            throw new BadRequestException("status: draft | ai_filled | ready | incomplete | unfinished | all");
        }
        Set<String> wanted = null;
        if (ids != null && !ids.isBlank()) {
            wanted = new HashSet<>();
            for (String id : ids.split(",")) {
                if (!id.isBlank()) {
                    wanted.add(normalizeId(id.trim()));
                }
            }
        }
        List<CardExportItem> out = new ArrayList<>();
        for (Product p : productRepository.findAllNotArchived()) {
            String id = UuidUtil.toString(p.getId());
            if (wanted != null && !wanted.contains(id)) {
                continue;
            }
            boolean match = switch (st) {
                case "draft" -> status(p) == CardStatus.DRAFT;
                case "ai_filled" -> status(p) == CardStatus.AI_FILLED;
                case "ready" -> status(p) == CardStatus.READY;
                case "incomplete" -> isIncomplete(s, p);
                case "unfinished" -> isUnfinished(p);
                default -> true;
            };
            if (match) {
                out.add(exportItem(s, p));
            }
        }
        return out;
    }

    static CardExportItem exportItem(CatalogSnapshot s, Product p) {
        String cid = ProductCatalogFields.categoryId(p);
        CatalogSnapshot.Cat cat = s.category(cid);
        CatalogSnapshot.BrandInfo brand = s.brand(ProductCatalogFields.brandId(p));
        Map<String, Object> specs = ProductCatalogFields.specs(p);
        String image = p.getImages().isEmpty() ? null : p.getImages().get(0).getUrl();
        return new CardExportItem(UuidUtil.toString(p.getId()), p.getTitle(), p.getSlug(), cid,
                cat == null ? null : cat.slug(), brand == null ? null : brand.name(), ProductCatalogFields.condition(p),
                p.getConditionNote(), p.getDescription(), specs, status(p).name(), p.getCardConfidence(),
                SpecsJson.readMap(p.getCardMetaJson()), s.missingRequired(cid, specs),
                p.getVariants().stream().map(ProductVariant::getName).toList(), image, p.getPriceMinor(),
                p.getPriceMinor() / 100, p.isActive(), p.getStock(), p.isUnfinished());
    }

    // ------------------------------------------------------------------ import

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
            throw new BadRequestException("items required");
        }
        if (req.items().size() > MAX_IMPORT_ITEMS) {
            throw new BadRequestException("too many items (max " + MAX_IMPORT_ITEMS + ")");
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
                pid = normalizeId(item.productId().trim());
            } catch (BadRequestException e) {
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
        String pid = normalizeId(productId == null ? "" : productId.trim());
        Product p = productRepository.findByIdForUpdate(UuidUtil.toBytes(pid))
                .orElseThrow(() -> new NotFoundException("product not found"));
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
            afterCommit(translationService::invalidate);
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
            p.setConditionNote(cut(trimToNull(item.conditionNote()), 255));
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
            AdminProductService.setStatus(p, CardStatus.READY, adminId);
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
            Map<String, Object> changed = changes(categoryBefore, categoryAfter, brandNameBefore, brandNameAfter,
                    specsBefore, SpecsJson.readMap(p.getSpecsJson()), textChanges, item);
            Map<String, Object> meta = manual ? SpecsJson.readMap(p.getCardMetaJson()) : meta(p, item);
            // An AI import replaces the snapshot (no history kept); the admin's edits are merged into it.
            meta.put("last", manual ? mergeLast(meta.get("last"), changed) : lastOf(changed, item));
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
            } else if (status(p) == CardStatus.DRAFT) {
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

    /**
     * What one import changed: {@code category} / {@code brand} {before, after}, {@code specs}
     * {key: {before, after, c?, src?}} and {@code texts} {"lang/field": {before, after}} — changes only.
     */
    static Map<String, Object> changes(String catBefore, String catAfter, String brandBefore, String brandAfter,
                                       Map<String, Object> specsBefore, Map<String, Object> specsAfter,
                                       Map<String, Object[]> texts, CardImportItem item) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (!Objects.equals(catBefore, catAfter)) {
            out.put("category", beforeAfter(catBefore, catAfter));
        }
        if (!Objects.equals(brandBefore, brandAfter)) {
            out.put("brand", beforeAfter(brandBefore, brandAfter));
        }
        Map<String, Object> specs = new LinkedHashMap<>();
        Set<String> keys = new LinkedHashSet<>(specsAfter.keySet());
        keys.addAll(specsBefore.keySet());
        for (String k : keys) {
            Object b = specsBefore.get(k);
            Object a = specsAfter.get(k);
            if (Objects.equals(b, a)) {
                continue;
            }
            Map<String, Object> e = beforeAfter(b, a);
            Integer c = confidenceOf(item.confidence() == null ? null : item.confidence().get(k));
            if (c != null) {
                e.put("c", c);
            }
            String src = sourceOf(item, k);
            if (src != null) {
                e.put("src", src);
            }
            specs.put(k, e);
        }
        out.put("specs", specs);
        Map<String, Object> textsOut = new LinkedHashMap<>();
        texts.forEach((k, v) -> textsOut.put(k, beforeAfter(v[0], v[1])));
        out.put("texts", textsOut);
        return out;
    }

    private static Map<String, Object> beforeAfter(Object before, Object after) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("before", before);
        m.put("after", after);
        return m;
    }

    private static Map<String, Object> lastOf(Map<String, Object> changed, CardImportItem item) {
        Map<String, Object> last = new LinkedHashMap<>();
        last.put("at", Instant.now().toString());
        if (item.model() != null) {
            last.put("model", cut(item.model(), 120));
        }
        last.put("changed", changed);
        return last;
    }

    /**
     * The admin's edits on top of the last AI import: an entry already there keeps its «before»
     * (the value before the AI) and gets the new «after»; a new one is added. Both get edited=true.
     */
    @SuppressWarnings("unchecked")
    static Map<String, Object> mergeLast(Object old, Map<String, Object> edits) {
        Map<String, Object> last = old instanceof Map<?, ?> m ? new LinkedHashMap<>((Map<String, Object>) m)
                : new LinkedHashMap<>();
        Map<String, Object> changed = last.get("changed") instanceof Map<?, ?> m
                ? new LinkedHashMap<>((Map<String, Object>) m) : new LinkedHashMap<>();
        for (String scalar : List.of("category", "brand")) {
            if (edits.get(scalar) instanceof Map<?, ?> e) {
                changed.put(scalar, edited(changed.get(scalar), (Map<String, Object>) e));
            }
        }
        for (String group : List.of("specs", "texts")) {
            Map<String, Object> target = changed.get(group) instanceof Map<?, ?> m
                    ? new LinkedHashMap<>((Map<String, Object>) m) : new LinkedHashMap<>();
            if (edits.get(group) instanceof Map<?, ?> g) {
                for (Map.Entry<String, Object> e : ((Map<String, Object>) g).entrySet()) {
                    target.put(e.getKey(), edited(target.get(e.getKey()), (Map<String, Object>) e.getValue()));
                }
            }
            changed.put(group, target);
        }
        String now = Instant.now().toString();
        last.putIfAbsent("at", now);
        last.put("editedAt", now);
        last.put("changed", changed);
        return last;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> edited(Object old, Map<String, Object> edit) {
        Map<String, Object> e = old instanceof Map<?, ?> m ? new LinkedHashMap<>((Map<String, Object>) m)
                : new LinkedHashMap<>(edit);
        e.put("after", edit.get("after"));
        e.put("edited", true);
        return e;
    }

    /** card_meta: confidence (+ source) per field (merged), sources, notes, model, overall, importedAt. */
    @SuppressWarnings("unchecked")
    static Map<String, Object> meta(Product p, CardImportItem item) {
        Map<String, Object> meta = SpecsJson.readMap(p.getCardMetaJson());
        Map<String, Object> fields = meta.get("fields") instanceof Map<?, ?> m
                ? new LinkedHashMap<>((Map<String, Object>) m) : new LinkedHashMap<>();
        if (item.confidence() != null) {
            for (Map.Entry<String, Object> e : item.confidence().entrySet()) {
                Integer c = confidenceOf(e.getValue());
                if (c != null) {
                    Map<String, Object> f = new LinkedHashMap<>();
                    f.put("c", c);
                    String src = sourceOf(item, e.getKey());
                    if (src != null) {
                        f.put("src", src);
                    }
                    fields.put(e.getKey(), f);
                }
            }
        }
        meta.put("fields", fields);
        if (item.sources() != null) {
            meta.put("sources", item.sources().stream().filter(Objects::nonNull).limit(50).toList());
        }
        if (item.notes() != null) {
            meta.put("notes", cut(item.notes(), 4000));
        }
        if (item.model() != null) {
            meta.put("model", cut(item.model(), 120));
        }
        if (item.overall() != null) {
            meta.put("overall", Math.max(0, Math.min(100, item.overall())));
        }
        meta.put("importedAt", Instant.now().toString());
        return meta;
    }

    private static Integer confidenceOf(Object v) {
        return v instanceof Number n ? Math.max(0, Math.min(100, n.intValue())) : null;
    }

    /** Source url the AI named for one characteristic (http/https only). */
    private static String sourceOf(CardImportItem item, String key) {
        String src = item.fieldSources() == null ? null : trimToNull(item.fieldSources().get(key));
        return src != null && src.matches("(?i)^https?://\\S+$") ? cut(src, 500) : null;
    }

    // ------------------------------------------------------------------ review panel

    /** The card + the snapshot of the last import, the reviewer's name and the current uk/en texts. */
    @Transactional(readOnly = true)
    public CardReview review(String productId) {
        String pid = normalizeId(productId == null ? "" : productId.trim());
        Product p = productRepository.findByIdWithDetails(UuidUtil.toBytes(pid))
                .filter(x -> !x.isArchived())
                .orElseThrow(() -> new NotFoundException("product not found"));
        CardExportItem item = exportItem(directory.snapshot(), p);
        Map<String, Object> meta = item.cardMeta() == null ? Map.of() : item.cardMeta();
        @SuppressWarnings("unchecked")
        Map<String, Object> last = meta.get("last") instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
        Long reviewedBy = meta.get("reviewedBy") instanceof Number n ? n.longValue() : null;
        String reviewedByName = reviewedBy == null ? null : adminUserRepository.findById(reviewedBy)
                .map(a -> trimToNull(a.getName()) != null ? a.getName().trim() : trimToNull(a.getUsername()))
                .orElse(null);
        Map<String, String> sources = new LinkedHashMap<>();
        sources.put(TranslationEntityType.TITLE, p.getTitle());
        sources.put(TranslationEntityType.DESCRIPTION, p.getDescription());
        sources.put(TranslationEntityType.CONDITION_NOTE, p.getConditionNote());
        Map<String, Map<String, CardTextState>> translations = new LinkedHashMap<>();
        for (String locale : ContentLocale.TRANSLATED) {
            Map<String, CardTextState> texts = new LinkedHashMap<>();
            sources.forEach((field, source) -> translationRepository
                    .findById(new ContentTranslationId(TranslationEntityType.PRODUCT, p.getId(), field, locale))
                    .ifPresent(row -> texts.put(textKey(field), new CardTextState(row.getText(),
                            row.getOrigin().name(),
                            source == null || !TranslationService.sha256Hex(source).equals(row.getSourceHash())))));
            translations.put(locale, texts);
        }
        return new CardReview(item, last, str(meta.get("importedAt")), str(meta.get("reviewedAt")), reviewedBy,
                reviewedByName, translations);
    }

    private static String str(Object o) {
        return o instanceof String x ? x : null;
    }

    /** content_translations field → the name the admin UI uses ("condition_note" → "conditionNote"). */
    static String textKey(String field) {
        return TranslationEntityType.CONDITION_NOTE.equals(field) ? "conditionNote" : field;
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
        if (text.length() > TranslationAdminService.MAX_TEXT_CHARS
                || text.getBytes(StandardCharsets.UTF_8).length > 65_535) {
            tr.issues().add(new CardIssue(tr.pid(), key, "INVALID_TEXT_TOO_LONG", "перевод слишком длинный"));
            return;
        }
        if (source == null || source.isBlank()) {
            tr.issues().add(new CardIssue(tr.pid(), key, "NO_SOURCE", "нет русского текста для перевода"));
            return;
        }
        ContentTranslationId id = new ContentTranslationId(TranslationEntityType.PRODUCT, tr.p().getId(), field,
                tr.locale());
        ContentTranslation row = translationRepository.findById(id).orElse(null);
        if (row != null && row.getOrigin() == TranslationOrigin.MANUAL && !tr.manual()) {
            tr.counts()[1]++;
            return;
        }
        String before = row == null ? null : row.getText();
        if (row == null) {
            row = new ContentTranslation(id);
        }
        row.setText(text);
        row.setSource(source);
        row.setOrigin(tr.manual() ? TranslationOrigin.MANUAL : TranslationOrigin.AI);
        // An admin's accepted text is reviewed; new AI text goes back to «Проверить ИИ» on the «Переводы» screen.
        row.setReviewedAt(tr.manual() ? Instant.now() : null);
        row.setUpdatedBy(tr.adminId());
        translationRepository.save(row);
        tr.counts()[0]++;
        if (!text.equals(before)) {
            tr.changes().put(tr.locale() + "/" + textKey(field), new Object[]{before, text});
        }
    }

    private static String cut(String s, int max) {
        return s == null ? null : (s.length() > max ? s.substring(0, max) : s);
    }

    private static String normalizeId(String id) {
        try {
            return UuidUtil.toString(UuidUtil.toBytes(id));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("invalid id: " + id);
        }
    }

    private static void afterCommit(Runnable r) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    r.run();
                }
            });
        } else {
            r.run();
        }
    }
}
