package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Products of a supply / the gift field by id: archived ones too, in the asked order, unknown ids skipped. */
class AdminProductsByIdsTest {

    ProductRepository repo = mock(ProductRepository.class);
    CatalogDirectory directory = mock(CatalogDirectory.class);
    AdminProductsByIds byIds = new AdminProductsByIds(repo, directory);

    @BeforeEach
    void setUp() {
        when(directory.snapshot()).thenReturn(CatalogSnapshot.EMPTY);
    }

    private static Product product(String title, boolean archived) {
        Product p = new Product();
        ReflectionTestUtils.setField(p, "id", UuidUtil.randomBytes());
        p.retitle(title);
        p.archive(archived);
        return p;
    }

    @Test
    void returnsArchivedToo_inTheAskedOrder_skippingUnknown() {
        Product live = product("Mouse", false);
        Product gone = product("Old pad", true);
        String unknown = UUID.randomUUID().toString();
        when(repo.findAllByIdIn(anyCollection())).thenReturn(new ArrayList<>(List.of(live, gone)));

        List<AdminProductDto> out = byIds.byIds(List.of(
                UuidUtil.toString(gone.getId()), unknown, UuidUtil.toString(live.getId())));

        assertThat(out).extracting(AdminProductDto::title).containsExactly("Old pad", "Mouse");
        assertThat(out).extracting(AdminProductDto::archived).containsExactly(true, false);
    }

    @Test
    void blankAndDuplicateIds_areIgnored_emptyAsksNothing() {
        assertThat(byIds.byIds(List.of(" ", ""))).isEmpty();
        verify(repo, never()).findAllByIdIn(any());

        Product live = product("Mouse", false);
        String id = UuidUtil.toString(live.getId());
        when(repo.findAllByIdIn(anyCollection())).thenAnswer(inv -> {
            assertThat((Collection<?>) inv.getArgument(0)).hasSize(1);
            return List.of(live);
        });
        assertThat(byIds.byIds(List.of(id, " " + id + " "))).hasSize(1);
    }

    @Test
    void badId_isRejected() {
        assertThatThrownBy(() -> byIds.byIds(List.of("not-a-uuid")))
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(CatalogError.INVALID_ID));
    }

    @Test
    void tooManyIds_areRejected() {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i <= AdminProductsByIds.MAX_IDS; i++) ids.add(UUID.randomUUID().toString());
        assertThatThrownBy(() -> byIds.byIds(ids))
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(CatalogError.TOO_MANY_IDS));
    }
}
