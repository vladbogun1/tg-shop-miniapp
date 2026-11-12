package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.delivery.domain.BoxOptions;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.NpBox;
import com.maxsolch.shop.delivery.infra.NpBoxRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * «Коробки» in the admin: the catalog of Nova Poshta's boxes and our own ones — which are in stock, sides, fold
 * heights, tare and the branch's price. Catalog rows are never deleted (only taken out of stock); our own boxes are.
 * «Готово» marks the list as reviewed for every phone ({@link DeliverySettings#NP_BOXES_REVIEWED}).
 */
@Service
public class NpBoxAdmin {

    private final NpBoxRepository boxes;
    private final NpBoxCatalog catalog;
    private final SettingsService settings;
    private final AdminAuditService audit;

    NpBoxAdmin(NpBoxRepository boxes, NpBoxCatalog catalog, SettingsService settings, AdminAuditService audit) {
        this.boxes = boxes;
        this.catalog = catalog;
        this.settings = settings;
        this.audit = audit;
    }

    /** One height a box can stand at; {@code heightMm} null = a bag (as thick as the goods). */
    public record Fold(Integer heightMm, String label, boolean full) {
    }

    /**
     * One row of «Коробки».
     *
     * @param code          catalog code ({@code np-5}); null = our own box (can be deleted)
     * @param heightsMm     fold heights, the full one first; empty for a bag
     * @param packEstimated the branch price is a guess from the catalog, not checked
     * @param options       every height as the packer picks it («Коробка 5 кг · 13 см»)
     */
    public record BoxView(String id, String code, String name, String kind, int lengthMm, int widthMm,
                          List<Integer> heightsMm, int tareG, long packMinor, boolean packEstimated, boolean inStock,
                          boolean own, int sortOrder, List<Fold> options) {
    }

    /** {@code reviewed}: the owner pressed «Готово» once (shared by all phones). */
    public record BoxList(boolean reviewed, List<BoxView> boxes) {
    }

    /**
     * A change of a box; every null field stays as it is. Catalog rows: everything may be corrected (the catalog
     * values are «±0,5 см» and guesses); the price stops being an estimate once it is set.
     */
    public record BoxEdit(String name, String kind, Integer lengthMm, Integer widthMm, List<Integer> heightsMm,
                          Integer tareG, Long packMinor, Boolean inStock, Integer sortOrder) {
    }

    @Transactional(readOnly = true)
    public BoxList list() {
        return new BoxList(settings.getBoolFresh(DeliverySettings.NP_BOXES_REVIEWED),
                boxes.findAllByOrderBySortOrderAscNameAsc().stream().map(NpBoxAdmin::view).toList());
    }

    @Transactional
    public BoxView update(String id, BoxEdit edit) {
        NpBox b = find(id);
        apply(b, edit);
        validate(b);
        boxes.save(b);
        audit.record("NP_BOX_EDIT", "NP_BOX", id, "«" + b.getName() + "»" + (edit.inStock() == null ? ""
                : edit.inStock() ? ": есть в наличии" : ": нет в наличии"));
        return view(b);
    }

    @Transactional
    public BoxView create(BoxEdit edit) {
        if (edit == null || edit.name() == null || edit.name().isBlank()) {
            throw NpErrors.bad("Укажите название коробки");
        }
        NpBox b = new NpBox();
        b.setInStock(true);
        b.setSortOrder(catalog.nextSortOrder());
        apply(b, edit);
        validate(b);
        boxes.save(b);
        audit.record("NP_BOX_EDIT", "NP_BOX", UuidUtil.toString(b.getId()), "Новая коробка «" + b.getName() + "»");
        return view(b);
    }

    @Transactional
    public void delete(String id) {
        NpBox b = find(id);
        if (!b.own()) {
            throw NpErrors.bad("Коробку из каталога Новой почты не удаляем — снимите «есть у нас»");
        }
        boxes.delete(b);
        audit.record("NP_BOX_EDIT", "NP_BOX", id, "Удалена коробка «" + b.getName() + "»");
    }

    /** «Готово»: the list was reviewed (one flag for every packer's phone). */
    public BoxList markReviewed() {
        settings.update(Map.of(DeliverySettings.NP_BOXES_REVIEWED, true));
        return list();
    }

    private NpBox find(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new DomainException.NotFound(DeliveryError.NP_BOX_NOT_FOUND);
        }
        return boxes.findById(key).orElseThrow(() -> new DomainException.NotFound(DeliveryError.NP_BOX_NOT_FOUND));
    }

    private static void apply(NpBox b, BoxEdit e) {
        if (e == null) {
            return;
        }
        if (e.name() != null && !e.name().isBlank()) {
            b.setName(e.name().trim());
        }
        if (e.kind() != null) {
            b.setKind(NpBox.KIND_BAG.equalsIgnoreCase(e.kind().trim()) ? NpBox.KIND_BAG : NpBox.KIND_BOX);
        }
        if (e.lengthMm() != null) {
            b.setLengthMm(e.lengthMm());
        }
        if (e.widthMm() != null) {
            b.setWidthMm(e.widthMm());
        }
        if (e.heightsMm() != null) {
            b.setHeightsMm(NpBox.joinHeights(e.heightsMm().stream().filter(h -> h != null && h > 0).distinct()
                    .toList()));
        }
        if (e.tareG() != null) {
            b.setTareG(e.tareG());
        }
        if (e.packMinor() != null) {
            b.setPackMinor(e.packMinor());
            b.setPackEstimated(false);
        }
        if (e.inStock() != null) {
            b.setInStock(e.inStock());
        }
        if (e.sortOrder() != null) {
            b.setSortOrder(e.sortOrder());
        }
    }

    private static void validate(NpBox b) {
        if (b.getName() == null || b.getName().isBlank() || b.getName().length() > 80) {
            throw NpErrors.bad("Название коробки — от 1 до 80 символов");
        }
        if (!side(b.getLengthMm()) || !side(b.getWidthMm())) {
            throw NpErrors.bad("Длина и ширина — от 1 до 300 см");
        }
        List<Integer> heights = b.heights();
        if (b.bag()) {
            b.setHeightsMm(null);
        } else if (heights.isEmpty() || heights.stream().anyMatch(h -> !side(h)) || heights.size() > 8) {
            throw NpErrors.bad("У коробки нужна хотя бы одна высота от 1 до 300 см (до 8 линий сгиба)");
        } else if (heights.stream().skip(1).anyMatch(h -> h > heights.get(0))) {
            throw NpErrors.bad("Первая высота — полная: остальные (по линиям сгиба) не больше неё");
        }
        if (b.getTareG() < 0 || b.getTareG() > 50_000 || b.getPackMinor() < 0 || b.getPackMinor() > 1_000_000) {
            throw NpErrors.bad("Тара — до 50 кг, цена упаковки — до 10 000 ₴");
        }
    }

    private static boolean side(int mm) {
        return mm >= 10 && mm <= PackingConfirmation.MAX_SIDE_MM;
    }

    static BoxView view(NpBox b) {
        List<Fold> options = b.bag() ? List.of(new Fold(null, b.getName(), true))
                : b.heights().stream().map(h -> {
                    BoxOptions.Option o = BoxOptions.option(b, h);
                    return new Fold(h, o.label(), o.full());
                }).toList();
        return new BoxView(UuidUtil.toString(b.getId()), b.getCode(), b.getName(), b.getKind(), b.getLengthMm(),
                b.getWidthMm(), b.heights(), b.getTareG(), b.getPackMinor(), b.isPackEstimated(), b.isInStock(),
                b.own(), b.getSortOrder(), options);
    }
}
