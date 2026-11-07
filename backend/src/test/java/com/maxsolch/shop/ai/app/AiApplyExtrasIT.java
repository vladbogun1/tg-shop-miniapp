package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.catalog.app.AdminCards;
import com.maxsolch.shop.catalog.app.AdminProducts;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardTranslation;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.app.ProductPhotoImport;
import com.maxsolch.shop.catalog.domain.Category;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.catalog.infra.CategoryRepository;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.media.app.ImageImport;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.translation.app.StoredTranslations;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * «Отменить применение» gives back everything an application wrote, not only the card fields: the photos it added
 * (the rows and the files, the way the admin deletes a photo), the uk/en translations (the earlier row or none),
 * the card status, its confidence and journal ({@code card_meta}), and the storefront. A field somebody changed by hand
 * after the application stays as he left it and is named in the answer. Photos and «Сохранить цену и выложить» come
 * after the card is saved: they name the application and are written into its log on the server.
 */
class AiApplyExtrasIT extends AbstractMysqlIT {

    private static final long ADMIN = 7L;
    private static final String OLD_UK_TITLE = "Стара назва";

    @Autowired
    AiSafeAccept apply;
    @Autowired
    AiApplyUndo undo;
    @Autowired
    AiBatchStarter starter;
    @Autowired
    AdminCards cards;
    @Autowired
    AdminProducts adminProducts;
    @Autowired
    ProductPhotoImport photos;
    @Autowired
    StoredTranslations translations;
    @Autowired
    CategoryRepository categories;

    @MockitoBean
    AiAgent agent;
    @MockitoBean
    CurrentActor actor;
    @MockitoBean
    AdminAccess access;
    @MockitoBean
    ImageImport imageImport;

    private int photoNo;

    @BeforeEach
    void setUp() {
        when(actor.userId()).thenReturn(ADMIN);
        when(actor.isPresent()).thenReturn(true);
        when(access.canSeeFinance(ADMIN)).thenReturn(true);
        when(imageImport.importFrom(any())).thenAnswer(inv ->
                new ImageImport.Imported("ai-fix5/" + UUID.randomUUID() + "-" + (++photoNo) + ".webp", inv.getArgument(0), true));
    }

    @Test
    void anUndoGivesBackPhotosTranslationsStatusAndTheStorefront() {
        Product p = hiddenDraftWithPhotoAndUkTitle();
        Before before = before(p);
        long job = readyJobOf(id(p));

        AiSafeAccept.Begun begun = apply.beginSingle(job);
        cards.importCards(fullAnswer(id(p), true));
        apply.finish(begun.id());
        String aiPhoto = photos.importPhoto(id(p), "https://atk.store/p/rs7.jpg", begun.id()).key();

        Product applied = fresh(p);
        assertThat(applied.isActive()).isTrue();
        assertThat(applied.getCardStatus().name()).isEqualTo("READY");
        assertThat(imageKeys(applied)).contains(aiPhoto);
        assertThat(text(p, "uk", "title")).isEqualTo("Нова назва");
        // the screen lists what comes back from the log, the later photo step included
        assertThat(undo.live(job).changed()).contains("photo:" + aiPhoto, "tr:uk:title", "status", "active");

        AiApplyUndo.Result r = undo.undo(begun.id());

        assertThat(r.skippedFields()).isEmpty();
        assertThat(r.revertedFields()).contains("photo:" + aiPhoto, "tr:uk:title", "tr:uk:description",
                "tr:en:description", "status", "meta", "confidence", "active", "unfinished", "description");
        Product back = fresh(p);
        assertThat(imageKeys(back)).containsExactly("human-before.webp");
        verify(imageStorageService).deleteQuietly(aiPhoto);
        verify(imageStorageService, never()).deleteQuietly("human-before.webp");
        assertThat(back.isActive()).isFalse();
        assertThat(back.isUnfinished()).isTrue();
        assertThat(back.getCardStatus().name()).isEqualTo("DRAFT");
        assertThat(back.getCardConfidence()).isNull();
        assertThat(back.getCardMetaJson()).isNull();
        assertThat(back.getDescription()).isEqualTo("Старое описание");
        assertThat(translations.find(TranslationEntityType.PRODUCT, p.getId(), "title", "uk").orElseThrow())
                .isEqualTo(before.ukTitle());
        assertThat(translations.find(TranslationEntityType.PRODUCT, p.getId(), "description", "uk")).isEmpty();
        assertThat(translations.find(TranslationEntityType.PRODUCT, p.getId(), "description", "en")).isEmpty();
    }

    @Test
    void whatSomebodyChangedByHandAfterTheApplicationStaysAndIsNamed() {
        Product p = hiddenDraftWithPhotoAndUkTitle();
        long job = readyJobOf(id(p));

        AiSafeAccept.Begun begun = apply.beginSingle(job);
        cards.importCards(fullAnswer(id(p), true));
        apply.finish(begun.id());
        String aiPhoto = photos.importPhoto(id(p), "https://atk.store/p/rs7.jpg", begun.id()).key();
        String humanPhoto = photos.importPhoto(id(p), "https://atk.store/p/rs7-side.jpg").key();
        // by hand, after the application: the uk title, the card status, the AI photo removed
        translations.write(TranslationEntityType.PRODUCT, p.getId(), "title", "uk", "Ручна назва", "src",
                TranslationOrigin.MANUAL, Instant.now(), ADMIN);
        cards.setCardStatus(id(p), "AI_FILLED");
        tx.executeWithoutResult(s -> {
            Product f = products.findById(p.getId()).orElseThrow();
            f.getImages().removeIf(img -> img.getUrl().equals(aiPhoto));
            products.save(f);
        });

        AiApplyUndo.Result r = undo.undo(begun.id());

        assertThat(r.skippedFields()).containsExactlyInAnyOrder("tr:uk:title", "status", "photo:" + aiPhoto);
        assertThat(text(p, "uk", "title")).isEqualTo("Ручна назва");
        Product back = fresh(p);
        assertThat(back.getCardStatus().name()).isEqualTo("AI_FILLED");
        assertThat(imageKeys(back)).containsExactly("human-before.webp", humanPhoto);
        assertThat(back.isActive()).isFalse();
        assertThat(translations.find(TranslationEntityType.PRODUCT, p.getId(), "description", "en")).isEmpty();
    }

    @Test
    void publishingAfterTheSaveWithTheApplicationIsUndoneToo() {
        Product p = hiddenDraftWithPhotoAndUkTitle();
        long job = readyJobOf(id(p));

        AiSafeAccept.Begun begun = apply.beginSingle(job);
        cards.importCards(fullAnswer(id(p), false));
        apply.finish(begun.id());
        assertThat(fresh(p).isActive()).isFalse();
        // «Сохранить цену и выложить»: a second step of the same application
        adminProducts.setActive(id(p), true, false, begun.id());
        assertThat(fresh(p).isActive()).isTrue();

        AiApplyUndo.Result r = undo.undo(begun.id());

        assertThat(r.revertedFields()).contains("active", "unfinished");
        assertThat(fresh(p).isActive()).isFalse();
        assertThat(fresh(p).isUnfinished()).isTrue();
    }

    @Test
    void aPhotoOfAnUndoneApplicationIsNotAddedAnyMore() {
        Product p = hiddenDraftWithPhotoAndUkTitle();
        long job = readyJobOf(id(p));
        AiSafeAccept.Begun begun = apply.beginSingle(job);
        cards.importCards(fullAnswer(id(p), false));
        apply.finish(begun.id());
        undo.undo(begun.id());

        assertThatThrownBy(() -> photos.importPhoto(id(p), "https://atk.store/p/late.jpg", begun.id()))
                .isInstanceOf(DomainException.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(AiError.UNDO_CLOSED));
        assertThat(imageKeys(fresh(p))).containsExactly("human-before.webp");
    }

    @Test
    void aSafeAcceptanceMayMoveTheCardStatusAndJournalAndIsUndoneWithThem() {
        Product p = hiddenDraftWithPhotoAndUkTitle();
        tx.executeWithoutResult(s -> {
            Product f = products.findById(p.getId()).orElseThrow();
            f.redescribe(null);
            products.save(f);
        });
        long job = readyJobOf(id(p));

        AiSafeAccept.Begun begun = apply.begin(job);
        cards.importCards(new CardsImportRequest(List.of(new CardImportItem(id(p), null, null, null,
                null, 80, "Описание ИИ", null, null, "it-model", false, null, null, null, null, false, null)), false));
        AiSafeAccept.Applied applied = apply.finish(begun.id());

        assertThat(applied.notSafe()).isEmpty();
        assertThat(applied.changed()).contains("description", "status", "meta");
        undo.undo(begun.id());
        Product back = fresh(p);
        assertThat(back.getDescription()).isNull();
        assertThat(back.getCardStatus().name()).isEqualTo("DRAFT");
        assertThat(back.getCardMetaJson()).isNull();
    }

    // ----------------------------------------------------------------------------------------------------------------

    private record Before(StoredTranslations.Stored ukTitle) {
    }

    private Before before(Product p) {
        return new Before(translations.find(TranslationEntityType.PRODUCT, p.getId(), "title", "uk").orElseThrow());
    }

    /** Hidden, never published, a draft card with a photo of its own and an AI uk title nobody checked. */
    private Product hiddenDraftWithPhotoAndUkTitle() {
        Category c = new Category();
        c.setName("IT Миші");
        c.setSlug("it-fix5-" + UUID.randomUUID().toString().substring(0, 8));
        byte[] category = categories.save(c).getId();
        Product p = product(1000, 1);
        tx.executeWithoutResult(s -> {
            Product f = products.findById(p.getId()).orElseThrow();
            f.startAsDraft();
            f.categorize(category);
            f.redescribe("Старое описание");
            ProductImage img = new ProductImage();
            img.setProduct(f);
            img.setUrl("human-before.webp");
            img.setSortOrder(0);
            f.getImages().add(img);
            products.save(f);
        });
        translations.write(TranslationEntityType.PRODUCT, p.getId(), "title", "uk", OLD_UK_TITLE, fresh(p).getTitle(),
                TranslationOrigin.AI, null, ADMIN);
        return p;
    }

    private static CardsImportRequest fullAnswer(String productId, boolean publish) {
        Map<String, CardTranslation> tr = Map.of(
                "uk", new CardTranslation("Нова назва", "Опис українською", null),
                "en", new CardTranslation(null, "English description", null));
        CardImportItem item = new CardImportItem(productId, null, null, null, null, 90, "Новое описание",
                List.of("https://atk.store"), "заметка", "it-model", true, null, null, null, tr, publish, null);
        return new CardsImportRequest(List.of(item), false);
    }

    private Product fresh(Product p) {
        return tx.execute(s -> {
            Product f = products.findById(p.getId()).orElseThrow();
            f.getImages().size();
            return f;
        });
    }

    private static List<String> imageKeys(Product p) {
        return p.getImages().stream()
                .sorted(java.util.Comparator.comparingInt(ProductImage::getSortOrder))
                .map(ProductImage::getUrl).toList();
    }

    private String text(Product p, String locale, String field) {
        return translations.find(TranslationEntityType.PRODUCT, p.getId(), field, locale)
                .map(StoredTranslations.Stored::text).orElse(null);
    }

    /** A finished DONE job of a batch for the product. */
    private long readyJobOf(String productId) {
        List<AiBatchStarter.Item> items = List.of(
                new AiBatchStarter.Item("PRODUCT", productId, "v1", "prompt", JobMode.NORMAL, "low", 1, null));
        long batch = starter.start(new AiBatchStarter.Plan(AiFeature.CARD, ADMIN, null, null, "it", items)).getId();
        long job = jdbc.queryForObject("select id from ai_jobs where batch_id = ?", Long.class, batch);
        jdbc.update("update ai_jobs set status = 'DONE', searches = 2, started_at = now(6), finished_at = now(6) where id = ?", job);
        return job;
    }
}
