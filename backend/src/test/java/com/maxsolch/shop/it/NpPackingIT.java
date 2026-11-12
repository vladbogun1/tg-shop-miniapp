package com.maxsolch.shop.it;

import com.maxsolch.shop.delivery.app.NpBoxAdmin;
import com.maxsolch.shop.delivery.app.NpBoxCatalog;
import com.maxsolch.shop.delivery.domain.PackingMemoryEntry;
import com.maxsolch.shop.delivery.domain.ParcelPacking.BoxPreset;
import com.maxsolch.shop.delivery.infra.PackingMemoryStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * V99 on a real MySQL: the box catalog seed, presets from the table (in stock only, every fold height, no bags),
 * and the packing memory counting uses per goods + box.
 */
class NpPackingIT extends AbstractMysqlIT {

    @Autowired
    private NpBoxAdmin boxes;
    @Autowired
    private NpBoxCatalog catalog;
    @Autowired
    private PackingMemoryStore memory;

    @Test
    void theCatalogIsSeededWithFourBoxesInStock() {
        NpBoxAdmin.BoxList list = boxes.list();
        assertThat(list.boxes()).hasSizeGreaterThanOrEqualTo(21);
        assertThat(list.boxes().stream().filter(b -> b.code() != null && b.inStock()).map(NpBoxAdmin.BoxView::code))
                .containsExactlyInAnyOrder("np-1", "np-2", "np-5", "np-10");
        NpBoxAdmin.BoxView np5 = list.boxes().stream().filter(b -> "np-5".equals(b.code())).findFirst().orElseThrow();
        assertThat(np5.heightsMm()).containsExactly(200, 130, 80);
        assertThat(np5.options()).extracting(NpBoxAdmin.Fold::label)
                .containsExactly("Коробка 5 кг", "Коробка 5 кг · 13 см", "Коробка 5 кг · 8 см");
        assertThat(np5.packEstimated()).isFalse();
    }

    @Test
    void v100CarriesOverWhatProdDeclaredBefore() {
        NpBoxAdmin.BoxList list = boxes.list();
        NpBoxAdmin.BoxView bag = list.boxes().stream().filter(b -> "Пакет НП".equals(b.name())).findFirst()
                .orElseThrow();
        assertThat(bag.own()).isTrue();
        assertThat(bag.kind()).isEqualTo("BAG");
        assertThat(bag.inStock()).isTrue();
        assertThat(List.of(bag.lengthMm(), bag.widthMm(), bag.tareG())).containsExactly(550, 500, 50);
        assertThat(list.boxes().stream().filter(b -> b.code() != null && b.inStock())
                .map(b -> b.code() + "=" + b.tareG()))
                .containsExactlyInAnyOrder("np-1=100", "np-2=200", "np-5=300", "np-10=600");
    }

    @Test
    void presetsComeFromTheBoxesInStock() {
        List<BoxPreset> presets = catalog.presets();
        assertThat(presets).extracting(BoxPreset::name).contains("Коробка 1 кг", "Коробка 5 кг · 8 см",
                "Коробка 10 кг · 8,5 см").noneMatch(n -> n.startsWith("Пакет"));
    }

    @Test
    void theMemoryCountsUsesPerGoodsAndBox() {
        String sig = UUID.randomUUID().toString().replace("-", "");
        byte[] box = new byte[16];
        box[0] = 42;
        Instant t = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        PackingMemoryEntry e = new PackingMemoryEntry(sig, "b@80", box, 400, 240, 80, 1, t);
        memory.remember(e, t);
        memory.remember(e, t.plusSeconds(5));
        memory.remember(new PackingMemoryEntry(sig, "custom:300x200x100", null, 300, 200, 100, 1, t), t);

        List<PackingMemoryEntry> got = memory.boxesFor(List.of(sig));
        assertThat(got).hasSize(1);
        assertThat(got.get(0).uses()).isEqualTo(2);
        assertThat(got.get(0).heightMm()).isEqualTo(80);
        assertThat(got.get(0).lastUsedAt()).isEqualTo(t.plusSeconds(5));
        jdbc.update("DELETE FROM np_packing_memory WHERE goods_sig = ?", sig);
    }
}
