package com.maxsolch.shop.catalog;

import com.maxsolch.shop.catalog.CatalogDtos.CategoryUpsertRequest;
import com.maxsolch.shop.catalog.CatalogDtos.ReorderItem;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.service.SlugService;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.ConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/** Tree rules: depth ≤ 2, no products in a parent, no deleting a non-empty category, reorder. */
class CategoryTreeTest {

    InMemoryCatalog db;
    CategoryAdminService service;
    Category keyboards;
    Category magnetic;
    Category mice;

    @BeforeEach
    void setUp() {
        db = new InMemoryCatalog();
        service = new CategoryAdminService(db.categoryRepository, db.productRepository,
                new SlugService(db.productRepository, db.categoryRepository), mock(TranslationService.class),
                db.directory);
        keyboards = db.category("klaviatury", "Клавиатуры", null);
        magnetic = db.category("klv-magnitnye", "Магнитные", keyboards);
        mice = db.category("myshki", "Мыши", null);
        db.product("Wooting 80HE", magnetic);
        db.product("Lamzu Maya", mice);
    }

    private static String id(Category c) {
        return UuidUtil.toString(c.getId());
    }

    private static CategoryUpsertRequest parent(String parentId) {
        return new CategoryUpsertRequest(null, null, parentId, null, null, null, null, null, null, null);
    }

    @Test
    void aThirdLevelIsRefused() {
        assertThatThrownBy(() -> service.update(id(mice), parent(id(magnetic))))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getCode()).isEqualTo(CategoryRules.TOO_DEEP));
    }

    @Test
    void aCategoryWithProductsCannotBecomeAParent() {
        Category other = db.category("klv-mekhanicheskie", "Механические", null);
        assertThatThrownBy(() -> service.update(id(other), parent(id(mice))))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getCode()).isEqualTo(CategoryRules.HAS_PRODUCTS));
    }

    @Test
    void createUnderAParentGeneratesASlugAndKeepsSiblingNamesUnique() {
        CategoryAdminService.Saved s = service.create(new CategoryUpsertRequest("Механические", null, id(keyboards),
                null, null, null, null, null, null, null));
        assertThat(s.category().slug()).isEqualTo("mekhanicheskie");
        assertThat(s.category().parentId()).isEqualTo(id(keyboards));
        assertThat(s.category().sortOrder()).isEqualTo(10);
        assertThatThrownBy(() -> service.create(new CategoryUpsertRequest("механические", null, id(keyboards),
                null, null, null, null, null, null, null)))
                .isInstanceOf(com.maxsolch.shop.web.BadRequestException.class);
    }

    @Test
    void deleteIsRefusedForChildrenAndProducts() {
        assertThatThrownBy(() -> service.delete(id(keyboards)))
                .satisfies(e -> assertThat(((ConflictException) e).getCode()).isEqualTo(CategoryRules.HAS_CHILDREN));
        assertThatThrownBy(() -> service.delete(id(mice)))
                .satisfies(e -> assertThat(((ConflictException) e).getCode()).isEqualTo(CategoryRules.HAS_PRODUCTS));
        Category empty = db.category("pusto", "Пусто", null);
        assertThat(service.delete(id(empty)).slug()).isEqualTo("pusto");
        assertThat(db.categories).doesNotContain(empty);
    }

    @Test
    void reorderMovesAndChecksTheFinalTree() {
        Category glides = db.category("glaydy", "Глайды", null);
        service.reorder(List.of(new ReorderItem(id(glides), id(keyboards), 50), new ReorderItem(id(mice), null, 5)));
        assertThat(glides.getParentId()).isEqualTo(keyboards.getId());
        assertThat(glides.getSortOrder()).isEqualTo(50);
        assertThat(mice.getSortOrder()).isEqualTo(5);

        // moving the parent under another root would make three levels
        assertThatThrownBy(() -> service.reorder(List.of(new ReorderItem(id(keyboards), id(mice), 1))))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void keysMustBeUniqueAlongAPath() {
        CatalogSnapshot ok = CatalogFixtures.snapshot();
        CategoryRules.checkKeys(ok);
        List<CatalogSnapshot.Attr> attrs = new java.util.ArrayList<>(ok.attributes());
        attrs.add(CatalogFixtures.attr("hot_swap", CatalogFixtures.MAGNETIC, SpecType.BOOL, false, false, List.of()));
        CatalogSnapshot clash = new CatalogSnapshot(ok.categories(), ok.brands(), ok.groups(), attrs);
        assertThatThrownBy(() -> CategoryRules.checkKeys(clash))
                .satisfies(e -> assertThat(((ConflictException) e).getCode()).isEqualTo(CategoryRules.KEY_TAKEN));
    }
}
