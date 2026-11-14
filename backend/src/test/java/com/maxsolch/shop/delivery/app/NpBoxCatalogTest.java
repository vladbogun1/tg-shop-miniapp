package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NpBox;
import com.maxsolch.shop.delivery.infra.NpBoxRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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

    @Test
    void theSeatsOwnBoxesAreSavedOnceAndNotWhenTheCatalogHasThem() {
        NpBox have = new NpBox();
        have.setKind(NpBox.KIND_BOX);
        have.setLengthMm(400);
        have.setWidthMm(240);
        have.setHeightsMm("80");
        have.setSortOrder(10);
        when(repo.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of(have));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));

        catalog.saveOwnAll(List.of(
                new NpBoxCatalog.OwnBox("Короб", 400, 240, 80, false),       // the catalog has it
                new NpBoxCatalog.OwnBox("Стрейч", 490, 420, 10, true),
                new NpBoxCatalog.OwnBox("Стрейч ещё", 490, 420, 12, true)));  // the same bag, another thickness

        ArgumentCaptor<NpBox> saved = ArgumentCaptor.forClass(NpBox.class);
        verify(repo, times(1)).save(saved.capture());
        assertThat(saved.getValue().getName()).isEqualTo("Стрейч");
        assertThat(saved.getValue().getKind()).isEqualTo(NpBox.KIND_BAG);
        assertThat(saved.getValue().getHeightsMm()).isNull();
    }
}
