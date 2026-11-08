package com.maxsolch.shop.catalog.domain;

import com.maxsolch.shop.catalog.domain.CatalogSnapshot.Attr;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot.Cat;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot.Option;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Раздел «Категории» и «Схема характеристик» промпта ИИ-карточки. Тот же текст, что {@code schemaSection} в
 * frontend-admin/features/cards/model/prompt.ts и дерево из schema.ts (листья в порядке дерева, путь через « › »).
 */
public final class CardSchemaSection {

    private static final String UNCATEGORIZED_NOTE =
            "У части товаров нет категории или она неизвестна: выбери для них категорию-лист и заполни только общие "
                    + "характеристики — схему этой категории я пришлю следующим запросом.";

    private CardSchemaSection() {
    }

    /** Раздел схемы для пакета товаров с данными категориями (null / неизвестная — «без категории»). */
    public static String render(CatalogSnapshot snap, List<String> categoryIds) {
        List<String> out = new ArrayList<>();
        out.add("## Категории (товар кладётся только в лист; slug — название)");
        for (Cat leaf : leaves(snap)) {
            out.add("- " + leaf.slug() + " — " + pathName(snap, leaf.id()));
        }
        out.add("");
        out.add("## Схема характеристик");
        out.add("");
        out.add("### Общие для всех категорий");
        List<Attr> globals = attrsOf(snap, null);
        if (globals.isEmpty()) {
            out.add("- (нет)");
        }
        globals.forEach(a -> out.add(attributeLine(a)));

        List<String> leafIds = new ArrayList<>();
        boolean uncategorized = neededLeaves(snap, categoryIds, leafIds);
        List<String> sections = sectionIds(snap, leafIds);
        if (!sections.isEmpty()) {
            out.add("");
            out.add("Характеристики товара = «Общие» + раздел его корневой категории + раздел его подкатегории (если есть).");
        }
        sections.forEach(id -> out.addAll(categorySection(snap, id)));
        if (uncategorized) {
            out.add("");
            out.add(UNCATEGORIZED_NOTE);
        }
        return String.join("\n", out);
    }

    /** Путь категории от корня через « › »; пусто для неизвестной. */
    public static String pathName(CatalogSnapshot snap, String categoryId) {
        return String.join(" › ", snap.path(categoryId).stream().map(Cat::name).toList());
    }

    /** Листья в порядке дерева: сортировка корней и детей по sort, затем по названию (ru-коллатор, как localeCompare). */
    public static List<Cat> leaves(CatalogSnapshot snap) {
        List<Cat> out = new ArrayList<>();
        walk(snap, null, out, 0);
        return out;
    }

    private static void walk(CatalogSnapshot snap, String parentId, List<Cat> out, int depth) {
        Collator ru = Collator.getInstance(Locale.forLanguageTag("ru"));
        List<Cat> kids = new ArrayList<>(snap.children(parentId));
        kids.sort(Comparator.comparingInt(Cat::sortOrder).thenComparing(Cat::name, ru));
        for (Cat c : kids) {
            if (snap.isLeaf(c.id()) || depth > 10) {
                out.add(c);
            } else {
                walk(snap, c.id(), out, depth + 1);
            }
        }
    }

    /** Заполняет листья, схема которых нужна; true — у части товаров категории нет или она неизвестна. */
    private static boolean neededLeaves(CatalogSnapshot snap, List<String> categoryIds, List<String> leafIds) {
        boolean uncategorized = false;
        List<Cat> all = leaves(snap);
        for (String id : categoryIds) {
            if (id == null || snap.category(id) == null) {
                uncategorized = true;
            } else if (snap.isLeaf(id)) {
                addOnce(leafIds, id);
            } else {
                all.stream().filter(l -> snap.path(l.id()).stream().anyMatch(c -> c.id().equals(id)))
                        .forEach(l -> addOnce(leafIds, l.id()));
            }
        }
        return uncategorized;
    }

    private static List<String> sectionIds(CatalogSnapshot snap, List<String> leafIds) {
        List<String> sections = new ArrayList<>();
        for (String leaf : leafIds) {
            snap.path(leaf).forEach(c -> addOnce(sections, c.id()));
        }
        return sections;
    }

    private static void addOnce(List<String> list, String v) {
        if (!list.contains(v)) {
            list.add(v);
        }
    }

    private static List<String> categorySection(CatalogSnapshot snap, String id) {
        boolean leaf = snap.isLeaf(id);
        List<String> out = new ArrayList<>();
        out.add("");
        out.add("### " + snap.category(id).slug() + " — " + pathName(snap, id) + (leaf ? "" : " (для всех подкатегорий)"));
        List<Attr> attrs = attrsOf(snap, id);
        if (attrs.isEmpty()) {
            out.add("- (своих характеристик нет)");
        }
        attrs.forEach(a -> out.add(attributeLine(a)));
        return out;
    }

    private static List<Attr> attrsOf(CatalogSnapshot snap, String categoryId) {
        return snap.attributes().stream()
                .filter(a -> categoryId == null ? a.categoryId() == null : categoryId.equals(a.categoryId()))
                .sorted(Comparator.comparingInt(Attr::sort))
                .toList();
    }

    static String attributeLine(Attr a) {
        String label = blankToNull(a.labelRu()) == null ? a.key() : a.labelRu().strip();
        String type = switch (a.type()) {
            case NUMBER -> a.range() ? "number, диапазон {\"min\",\"max\"}" : "number";
            case MULTI -> "multi (массив)";
            default -> a.type().json();
        };
        String unit = blankToNull(a.unitRu());
        List<String> parts = new ArrayList<>(List.of("- " + a.key() + " — " + label, unit == null ? type : type + ", " + unit.strip()));
        if (a.required()) {
            parts.add("обязательное");
        }
        StringBuilder line = new StringBuilder(String.join(" — ", parts));
        String hint = blankToNull(a.hint());
        if (hint != null) {
            line.append(" — подсказка: ").append(hint.strip());
        }
        boolean listed = a.type() == SpecType.ENUM || a.type() == SpecType.MULTI;
        if (listed && !a.options().isEmpty()) {
            line.append("\n    опции: ").append(String.join("; ", a.options().stream().map(CardSchemaSection::optionLine).toList()));
        }
        return line.toString();
    }

    private static String optionLine(Option o) {
        String label = o.labelRu();
        return label != null && !label.isEmpty() && !label.equals(o.value()) ? o.value() + " (" + label + ")" : o.value();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
