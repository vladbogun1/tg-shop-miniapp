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
import com.maxsolch.shop.platform.security.AdminDirectory;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.ContentTranslationId;
import com.maxsolch.shop.translation.infra.ContentTranslationRepository;
import com.maxsolch.shop.translation.app.TranslationAdminService;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import com.maxsolch.shop.translation.app.TranslationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/**
 * «Карточки» (docs/CATALOG-SPECS.md §3.4), the reading side: stats, export for the AI prompt and the review panel.
 * Applying an AI answer is {@link CardsImporter}.
 */
@Service
public class CardsService {

    private final ProductRepository productRepository;
    private final CatalogDirectory directory;
    private final StoredTranslations translations;
    private final AdminDirectory adminDirectory;

    public CardsService(ProductRepository productRepository, CatalogDirectory directory,
                        StoredTranslations translations, AdminDirectory adminDirectory) {
        this.productRepository = productRepository;
        this.directory = directory;
        this.translations = translations;
        this.adminDirectory = adminDirectory;
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
            throw CatalogErrors.badRequest("status: draft | ai_filled | ready | incomplete | unfinished | all");
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

    // ------------------------------------------------------------------ review panel

    /** The card + the snapshot of the last import, the reviewer's name and the current uk/en texts. */
    @Transactional(readOnly = true)
    public CardReview review(String productId) {
        String pid = normalizeId(productId == null ? "" : productId.trim());
        Product p = productRepository.findByIdWithDetails(UuidUtil.toBytes(pid))
                .filter(x -> !x.isArchived())
                .orElseThrow(() -> CatalogErrors.notFound("product not found"));
        CardExportItem item = exportItem(directory.snapshot(), p);
        Map<String, Object> meta = item.cardMeta() == null ? Map.of() : item.cardMeta();
        @SuppressWarnings("unchecked")
        Map<String, Object> last = meta.get("last") instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
        Long reviewedBy = meta.get("reviewedBy") instanceof Number n ? n.longValue() : null;
        String reviewedByName = reviewedBy == null ? null : adminDirectory.displayName(reviewedBy).orElse(null);
        Map<String, String> sources = new LinkedHashMap<>();
        sources.put(TranslationEntityType.TITLE, p.getTitle());
        sources.put(TranslationEntityType.DESCRIPTION, p.getDescription());
        sources.put(TranslationEntityType.CONDITION_NOTE, p.getConditionNote());
        Map<String, Map<String, CardTextState>> byLocale = new LinkedHashMap<>();
        for (String locale : ContentLocale.TRANSLATED) {
            Map<String, CardTextState> texts = new LinkedHashMap<>();
            sources.forEach((field, source) -> translations
                    .find(TranslationEntityType.PRODUCT, p.getId(), field, locale)
                    .ifPresent(row -> texts.put(textKey(field), new CardTextState(row.text(),
                            row.origin().name(),
                            source == null || !SourceHash.sha256Hex(source).equals(row.sourceHash())))));
            byLocale.put(locale, texts);
        }
        return new CardReview(item, last, str(meta.get("importedAt")), str(meta.get("reviewedAt")), reviewedBy,
                reviewedByName, byLocale);
    }

    private static String str(Object o) {
        return o instanceof String x ? x : null;
    }

    /** content_translations field → the name the admin UI uses ("condition_note" → "conditionNote"). */
    static String textKey(String field) {
        return TranslationEntityType.CONDITION_NOTE.equals(field) ? "conditionNote" : field;
    }

    static String normalizeId(String id) {
        try {
            return UuidUtil.toString(UuidUtil.toBytes(id));
        } catch (IllegalArgumentException e) {
            throw CatalogErrors.badRequest("invalid id: " + id);
        }
    }
}
