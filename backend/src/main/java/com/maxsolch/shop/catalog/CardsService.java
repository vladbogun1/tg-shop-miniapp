package com.maxsolch.shop.catalog;

import com.maxsolch.shop.catalog.CatalogDtos.CardExportItem;
import com.maxsolch.shop.catalog.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.CatalogDtos.CardIssue;
import com.maxsolch.shop.catalog.CatalogDtos.CardItemResult;
import com.maxsolch.shop.catalog.CatalogDtos.CardRejected;
import com.maxsolch.shop.catalog.CatalogDtos.CardTranslation;
import com.maxsolch.shop.catalog.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.CatalogDtos.CardsImportResult;
import com.maxsolch.shop.catalog.CatalogDtos.CardsStats;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
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

    public CardsService(ProductRepository productRepository, CatalogDirectory directory,
                        BrandAdminService brandService, ContentTranslationRepository translationRepository,
                        TranslationService translationService) {
        this.productRepository = productRepository;
        this.directory = directory;
        this.brandService = brandService;
        this.translationRepository = translationRepository;
        this.translationService = translationService;
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
                case DRAFT -> draft++;
                // waiting for review = what the storefront shows; hidden old products are not a to-do
                case AI_FILLED -> ai += p.isActive() ? 1 : 0;
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

    @Transactional
    public CardsImportResult importCards(CardsImportRequest req, Long adminId) {
        if (req == null || req.items() == null) {
            throw new BadRequestException("items required");
        }
        if (req.items().size() > MAX_IMPORT_ITEMS) {
            throw new BadRequestException("too many items (max " + MAX_IMPORT_ITEMS + ")");
        }
        boolean replace = Boolean.TRUE.equals(req.replaceSpecs());
        List<CardRejected> rejected = new ArrayList<>();
        List<CardIssue> issues = new ArrayList<>();
        List<String> createdBrands = new ArrayList<>();
        List<CardItemResult> results = new ArrayList<>();
        int applied = 0;
        boolean anyTranslation = false;

        for (CardImportItem item : req.items()) {
            if (item == null || item.productId() == null) {
                rejected.add(new CardRejected(null, "INVALID_ITEM"));
                continue;
            }
            String pid;
            try {
                pid = normalizeId(item.productId().trim());
            } catch (BadRequestException e) {
                rejected.add(new CardRejected(item.productId(), "INVALID_ID"));
                results.add(new CardItemResult(item.productId(), false, false, "INVALID_ID", Map.of(), 0));
                continue;
            }
            Product p = productRepository.findByIdForUpdate(UuidUtil.toBytes(pid)).orElse(null);
            if (p == null) {
                rejected.add(new CardRejected(pid, "NOT_FOUND"));
                results.add(new CardItemResult(pid, false, false, "NOT_FOUND", Map.of(), 0));
                continue;
            }
            // Brands created by earlier items must be visible: re-read the directory per item.
            CatalogSnapshot s = directory.load();
            boolean content = false;

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
                }
            }
            // brand: by name / alias, or created
            String brandName = trimToNull(item.brand());
            if (brandName != null) {
                boolean[] created = {false};
                Brand b = brandService.findOrCreate(brandName, created);
                if (b != null) {
                    p.setBrandId(b.getId());
                    if (created[0]) {
                        createdBrands.add(b.getName());
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
            Map<String, Object> current = SpecsJson.readMap(p.getSpecsJson());
            if (item.specs() != null) {
                SpecsValidator.Result r = SpecsValidator.validate(s.attributesFor(cid), item.specs());
                for (SpecsValidator.Issue i : r.issues()) {
                    issues.add(new CardIssue(pid, i.key(), i.reason(), i.message()));
                }
                Map<String, Object> merged = replace ? new LinkedHashMap<>() : new LinkedHashMap<>(current);
                merged.putAll(r.specs());
                // Keep only what the (current) schema knows, in schema order.
                SpecsValidator.Result clean = SpecsValidator.validate(s.attributesFor(cid), merged);
                p.setSpecsJson(SpecsJson.write(clean.specs()));
                content = true;
            }
            // card meta (journal of the AI fill)
            if (content || item.confidence() != null || item.overall() != null) {
                p.setCardMetaJson(SpecsJson.write(meta(p, item)));
                if (item.overall() != null) {
                    p.setCardConfidence(Math.max(0, Math.min(100, item.overall())));
                }
            }
            if (Boolean.TRUE.equals(item.markReady())) {
                AdminProductService.setStatus(p, CardStatus.READY, adminId);
            } else if (content) {
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
                    int[] counts = {0, 0};
                    CardTranslation t = e.getValue();
                    writeTranslation(pid, p, locale, TranslationEntityType.TITLE, p.getTitle(), t.title(), counts, issues, adminId);
                    writeTranslation(pid, p, locale, TranslationEntityType.DESCRIPTION, p.getDescription(),
                            t.description(), counts, issues, adminId);
                    writeTranslation(pid, p, locale, TranslationEntityType.CONDITION_NOTE, p.getConditionNote(),
                            t.conditionNote(), counts, issues, adminId);
                    translated.put(locale, counts[0]);
                    skippedManual += counts[1];
                    anyTranslation |= counts[0] > 0;
                }
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
            applied++;
            results.add(new CardItemResult(pid, true, published, reason, translated, skippedManual));
        }
        if (anyTranslation) {
            afterCommit(translationService::invalidate);
        }
        directory.evictAll();
        return new CardsImportResult(applied, rejected, issues, createdBrands, results);
    }

    /** card_meta: confidence per field (merged), sources, notes, model, overall, importedAt. */
    @SuppressWarnings("unchecked")
    static Map<String, Object> meta(Product p, CardImportItem item) {
        Map<String, Object> meta = SpecsJson.readMap(p.getCardMetaJson());
        Map<String, Object> fields = meta.get("fields") instanceof Map<?, ?> m
                ? new LinkedHashMap<>((Map<String, Object>) m) : new LinkedHashMap<>();
        if (item.confidence() != null) {
            for (Map.Entry<String, Object> e : item.confidence().entrySet()) {
                Integer c = e.getValue() instanceof Number n ? Math.max(0, Math.min(100, n.intValue())) : null;
                if (c != null) {
                    fields.put(e.getKey(), Map.of("c", c));
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

    /**
     * Writes one PRODUCT translation of the current Russian {@code source} (hash of the source as
     * stored). MANUAL rows are kept. counts[0] = written, counts[1] = skipped as MANUAL.
     */
    private void writeTranslation(String pid, Product p, String locale, String field, String source, String text,
                                  int[] counts, List<CardIssue> issues, Long adminId) {
        if (text == null) {
            return;
        }
        String key = "translations." + locale + "." + field;
        if (text.isBlank()) {
            issues.add(new CardIssue(pid, key, "INVALID_TEXT_BLANK", "пустой перевод"));
            return;
        }
        if (text.length() > TranslationAdminService.MAX_TEXT_CHARS
                || text.getBytes(StandardCharsets.UTF_8).length > 65_535) {
            issues.add(new CardIssue(pid, key, "INVALID_TEXT_TOO_LONG", "перевод слишком длинный"));
            return;
        }
        if (source == null || source.isBlank()) {
            issues.add(new CardIssue(pid, key, "NO_SOURCE", "нет русского текста для перевода"));
            return;
        }
        ContentTranslationId id = new ContentTranslationId(TranslationEntityType.PRODUCT, p.getId(), field, locale);
        ContentTranslation row = translationRepository.findById(id).orElse(null);
        if (row != null && row.getOrigin() == TranslationOrigin.MANUAL) {
            counts[1]++;
            return;
        }
        if (row == null) {
            row = new ContentTranslation(id);
        }
        row.setText(text);
        row.setSource(source);
        row.setOrigin(TranslationOrigin.AI);
        // New AI text: back to «Проверить ИИ» on the «Переводы» screen.
        row.setReviewedAt(null);
        row.setUpdatedBy(adminId);
        translationRepository.save(row);
        counts[0]++;
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
