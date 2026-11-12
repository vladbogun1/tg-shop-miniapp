package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NpBox;
import com.maxsolch.shop.delivery.domain.PackingMemoryEntry;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.ParcelPacking.Unit;
import com.maxsolch.shop.delivery.infra.PackingMemoryStore;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The suggested box: the one most used for these goods while it is still in the list, else by sizes. */
class BoxSuggestionTest {

    private final ParcelSizeService parcels = mock(ParcelSizeService.class);
    private final NpBoxCatalog catalog = mock(NpBoxCatalog.class);
    private final PackingMemoryStore memory = mock(PackingMemoryStore.class);
    private final BoxSuggestion suggestion = new BoxSuggestion(parcels, catalog, memory);

    private final ShippingOrder order = NpFixtures.order(OrderStatus.APPROVED, false, null);
    private final String sig = ShipmentFacts.goodsKey(order);
    private final NpBox np10 = box("Коробка 10 кг", 400, 340, "285,200,140,85", 350);
    private final Parcel bySize = Parcel.of(List.of(new Parcel.Seat(1500, 400, 240, 80, "Коробка 5 кг · 8 см")),
            "по размерам", 4000);

    private static NpBox box(String name, int l, int w, String heights, int tare) {
        NpBox b = new NpBox();
        b.setId(UuidUtil.randomBytes());
        b.setName(name);
        b.setKind(NpBox.KIND_BOX);
        b.setLengthMm(l);
        b.setWidthMm(w);
        b.setHeightsMm(heights);
        b.setTareG(tare);
        b.setPackMinor(4000);
        return b;
    }

    private PackingMemoryEntry remembered(NpBox b, int h, int uses) {
        return new PackingMemoryEntry(sig, PackingMemoryEntry.boxKey(UuidUtil.toString(b.getId()), h), b.getId(),
                b.getLengthMm(), b.getWidthMm(), h, uses, Instant.parse("2026-11-01T00:00:00Z"));
    }

    @BeforeEach
    void setUp() {
        when(parcels.forOrder(order)).thenReturn(bySize);
        when(parcels.units(order)).thenReturn(List.of(new Unit(1300, 380, 150, 50, true)));
        when(catalog.find(any())).thenAnswer(i -> Arrays.equals(i.getArgument(0), np10.getId())
                ? Optional.of(np10) : Optional.empty());
    }

    @Test
    void theRememberedBoxBeatsTheSizes() {
        when(memory.boxesFor(List.of(sig))).thenReturn(List.of(remembered(np10, 140, 3)));

        BoxSuggestion.Suggested s = suggestion.forOrder(order);

        assertThat(s.label()).isEqualTo("Коробка 10 кг · 14 см");
        assertThat(s.source()).isEqualTo("по прошлым заказам ×3");
        assertThat(s.parcel().seats()).hasSize(1);
        assertThat(s.parcel().heightMm()).isEqualTo(140);
        assertThat(s.parcel().lengthMm()).isEqualTo(400);
        assertThat(s.parcel().weightG()).isEqualTo(1300 + 350);
    }

    @Test
    void aDeletedBoxFallsBackToTheSizes() {
        NpBox gone = box("Удалённая", 300, 200, "100", 100);
        when(memory.boxesFor(List.of(sig))).thenReturn(List.of(remembered(gone, 100, 9)));

        BoxSuggestion.Suggested s = suggestion.forOrder(order);

        assertThat(s.parcel()).isSameAs(bySize);
        assertThat(s.label()).isEqualTo("Коробка 5 кг · 8 см");
        assertThat(s.source()).isEqualTo(BoxSuggestion.BY_SIZE);
    }

    @Test
    void aHeightTheBoxNoLongerFoldsToIsSkipped() {
        when(memory.boxesFor(List.of(sig))).thenReturn(List.of(remembered(np10, 99, 5), remembered(np10, 200, 2)));
        assertThat(suggestion.forOrder(order).label()).isEqualTo("Коробка 10 кг · 20 см");
    }

    @Test
    void documentsStayDocuments() {
        Parcel docs = new Parcel(300, 300, 200, 10, "t").withDocuments(true);
        when(parcels.forOrder(order)).thenReturn(docs);
        BoxSuggestion.Suggested s = suggestion.forOrder(order);
        assertThat(s.parcel()).isSameAs(docs);
        verify(memory, never()).boxesFor(any());
    }

    @Test
    void listRowsGetTheirRememberedBoxInOneQuery() {
        when(memory.boxesFor(List.of(sig))).thenReturn(List.of(remembered(np10, 85, 4), remembered(np10, 140, 1)));
        Map<String, BoxSuggestion.Hint> hints = suggestion.rememberedLabels(List.of(sig));
        assertThat(hints).containsOnlyKeys(sig);
        assertThat(hints.get(sig)).isEqualTo(new BoxSuggestion.Hint("Коробка 10 кг · 8,5 см",
                "по прошлым заказам ×4"));
    }
}
