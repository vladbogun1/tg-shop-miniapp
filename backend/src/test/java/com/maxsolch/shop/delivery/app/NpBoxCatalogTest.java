package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NpBox;
import com.maxsolch.shop.delivery.infra.NpBoxRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** A remembered box is suggested only while the packers have it (or nothing is marked «есть у нас» yet). */
class NpBoxCatalogTest {

    private final NpBoxRepository repo = mock(NpBoxRepository.class);
    private final NpBoxCatalog catalog = new NpBoxCatalog(repo);

    private NpBox box(boolean inStock) {
        NpBox b = new NpBox();
        b.setId(UuidUtil.randomBytes());
        b.setName("Коробка 3 кг");
        b.setKind(NpBox.KIND_BOX);
        b.setInStock(inStock);
        when(repo.findById(b.getId())).thenReturn(Optional.of(b));
        return b;
    }

    @Test
    void aBoxInStockIsUsable() {
        NpBox b = box(true);
        when(repo.existsByInStockTrue()).thenReturn(true);
        assertThat(catalog.findUsable(b.getId())).contains(b);
    }

    @Test
    void aBoxTakenOffStockIsNotUsable() {
        NpBox b = box(false);
        when(repo.existsByInStockTrue()).thenReturn(true);
        assertThat(catalog.findUsable(b.getId())).isEmpty();
    }

    @Test
    void whileNothingIsMarkedEveryBoxIsUsable() {
        NpBox b = box(false);
        when(repo.existsByInStockTrue()).thenReturn(false);
        assertThat(catalog.findUsable(b.getId())).contains(b);
    }

    @Test
    void anUnknownIdIsEmpty() {
        assertThat(catalog.findUsable(null)).isEmpty();
        assertThat(catalog.findUsable(UuidUtil.randomBytes())).isEmpty();
    }
}
