package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.translation.app.StoredTranslations;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.catalog.domain.Brand;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.Category;
import com.maxsolch.shop.catalog.domain.CategoryRules;
import com.maxsolch.shop.catalog.domain.SpecGroup;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.catalog.infra.BrandRepository;
import com.maxsolch.shop.catalog.infra.CategoryRepository;
import com.maxsolch.shop.catalog.infra.SpecAttributeRepository;
import com.maxsolch.shop.catalog.infra.SpecGroupRepository;
import com.maxsolch.shop.catalog.infra.SpecOptionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.translation.domain.TranslationsChanged;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * {@code PUT /api/admin/catalog/schema}: imports a whole schema in the {@code schema-draft.json}
 * format (docs/CATALOG-SPECS.md §3.2). Upsert by slug / key / value — never deletes anything.
 *
 * <p>Order inside the one transaction: groups → brands → categories (without parents; a new slug
 * may take over an existing category through {@code old_tag_slugs}) → {@code product_moves}
 * (an existing category with products is about to become a parent) → parents → tree checks →
 * attributes and options ({@link SchemaAttributesImport}) → key collision check. Any violation rolls the whole
 * import back.
 */
@Service
public class CatalogSchemaImporter {

    static final Pattern KEY = Pattern.compile("^[a-z][a-z0-9_]{0,47}$");
    static final Pattern VALUE = Pattern.compile("^[a-z0-9][a-z0-9_.+-]{0,63}$");

    public record Result(int groups, int categoriesCreated, int categoriesUpdated, int attributesCreated,
                         int attributesUpdated, int optionsCreated, int optionsUpdated, int brandsCreated,
                         int brandsUpdated, int productsMoved, List<String> warnings) {
    }

    private final CategoryRepository categoryRepository;
    private final BrandRepository brandRepository;
    private final SpecGroupRepository groupRepository;
    private final ProductRepository productRepository;
    private final StoredTranslations translations;
    private final DomainEvents events;
    private final CatalogDirectory directory;
    private final SchemaAttributesImport attributes;

    public CatalogSchemaImporter(CategoryRepository categoryRepository, BrandRepository brandRepository,
                                 SpecGroupRepository groupRepository, SpecAttributeRepository attributeRepository,
                                 SpecOptionRepository optionRepository, ProductRepository productRepository,
                                 StoredTranslations translations,
                                 DomainEvents events, CatalogDirectory directory) {
        this.categoryRepository = categoryRepository;
        this.brandRepository = brandRepository;
        this.groupRepository = groupRepository;
        this.productRepository = productRepository;
        this.translations = translations;
        this.events = events;
        this.directory = directory;
        this.attributes = new SchemaAttributesImport(attributeRepository, optionRepository);
    }

    static final class Counters {
        int groups;
        int catCreated;
        int catUpdated;
        int attrCreated;
        int attrUpdated;
        int optCreated;
        int optUpdated;
        int brandCreated;
        int brandUpdated;
        int moved;
        final List<String> warnings = new ArrayList<>();
    }

    @Transactional
    public Result importSchema(JsonNode root, Long adminId) {
        if (root == null || !root.isObject()) {
            throw new DomainException.BadRequest(CatalogError.BODY_NOT_JSON_OBJECT);
        }
        Counters n = new Counters();
        importGroups(root.path("groups"), n);
        importBrands(root.path("brands"), n);

        // ---- categories, pass 1: rows without parents
        JsonNode cats = root.path("categories");
        Map<String, Category> bySlug = new HashMap<>();
        for (Category c : new ArrayList<>(categoryRepository.findAll())) {
            bySlug.put(c.getSlug(), c);
        }
        Map<String, Category> imported = importCategories(cats, bySlug, n);
        categoryRepository.flush();

        // ---- product moves (before parents: a category with products may become a parent)
        moveProducts(root.path("product_moves"), bySlug, n);

        // ---- parents
        setParents(cats, imported, bySlug);
        List<Category> tree = categoryRepository.findAll();
        CategoryRules.checkTree(tree, id -> productRepository.countByCategory(id));
        categoryRepository.flush();

        // ---- attributes
        attributes.importAttributes(null, root.path("global_attributes"), n);
        for (JsonNode c : cats) {
            Category cat = imported.get(slug(text(c, "slug")));
            attributes.importAttributes(cat.getId(), c.path("attributes"), n);
        }
        attributes.flush();
        CategoryRules.checkKeys(directory.load());

        events.publish(new TranslationsChanged());
        directory.evictAll();
        return new Result(n.groups, n.catCreated, n.catUpdated, n.attrCreated, n.attrUpdated, n.optCreated,
                n.optUpdated, n.brandCreated, n.brandUpdated, n.moved, n.warnings);
    }

    // ------------------------------------------------------------------ parts

    /** Categories without parents, in import order; {@code bySlug} is updated with every saved row. */
    private Map<String, Category> importCategories(JsonNode cats, Map<String, Category> bySlug, Counters n) {
        Set<String> importSlugs = new HashSet<>();
        for (JsonNode c : cats) {
            String slug = slug(text(c, "slug"));
            if (slug == null) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_CATEGORY_NO_SLUG);
            }
            if (!importSlugs.add(slug)) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_CATEGORY_SLUG_DUPLICATE, slug);
            }
        }
        Map<String, Category> imported = new LinkedHashMap<>();
        int index = 0;
        for (JsonNode c : cats) {
            index++;
            String slug = slug(text(c, "slug"));
            Category cat = bySlug.get(slug);
            if (cat == null) {
                cat = takeOver(c, slug, bySlug, importSlugs, n);
            }
            cat = saveCategory(c, cat, slug, index, n);
            bySlug.put(slug, cat);
            imported.put(slug, cat);
            writeName(cat, c, n);
        }
        return imported;
    }

    /** An existing category named in {@code old_tag_slugs}, unless the import keeps that slug for itself. */
    private static Category takeOver(JsonNode c, String slug, Map<String, Category> bySlug, Set<String> importSlugs,
                                     Counters n) {
        for (JsonNode old : c.path("old_tag_slugs")) {
            String o = slug(old.asText());
            Category candidate = o == null ? null : bySlug.get(o);
            if (candidate != null && !importSlugs.contains(o)) {
                bySlug.remove(o);
                n.warnings.add("категория «" + o + "» переименована в «" + slug + "»");
                return candidate;
            }
        }
        return null;
    }

    private Category saveCategory(JsonNode c, Category existing, String slug, int index, Counters n) {
        Category cat = existing;
        String nameRu = text(c, "name_ru");
        if (cat == null) {
            if (nameRu == null) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_CATEGORY_NAME_REQUIRED, slug);
            }
            cat = new Category();
            n.catCreated++;
        } else {
            n.catUpdated++;
        }
        cat.setSlug(slug);
        if (nameRu != null) {
            cat.setName(cut(nameRu, 128));
        }
        Integer sort = intOrNull(c, "sort_order");
        cat.setSortOrder(sort != null ? sort : index * 10);
        if (c.has("show_in_menu") && !c.get("show_in_menu").isNull()) {
            cat.setShowInMenu(c.get("show_in_menu").asBoolean(true));
        }
        if (c.has("art_kind")) {
            cat.setArtKind(cut(text(c, "art_kind"), 32));
        }
        return categoryRepository.save(cat);
    }

    private void moveProducts(JsonNode moves, Map<String, Category> bySlug, Counters n) {
        for (JsonNode m : moves) {
            Category from = bySlug.get(slug(text(m, "from_category_slug")));
            Category to = bySlug.get(slug(text(m, "to_category_slug")));
            if (from == null || to == null) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_MOVE_UNKNOWN_CATEGORY, String.valueOf(m));
            }
            int moved = productRepository.moveCategory(from.getId(), to.getId());
            n.moved += moved;
            n.warnings.add("перенесено товаров " + from.getSlug() + " → " + to.getSlug() + ": " + moved);
        }
    }

    private static void setParents(JsonNode cats, Map<String, Category> imported, Map<String, Category> bySlug) {
        for (JsonNode c : cats) {
            Category cat = imported.get(slug(text(c, "slug")));
            String parentSlug = slug(text(c, "parent"));
            if (parentSlug == null) {
                cat.setParentId(null);
                continue;
            }
            Category parent = bySlug.get(parentSlug);
            if (parent == null) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_UNKNOWN_PARENT, cat.getSlug(), parentSlug);
            }
            if (Arrays.equals(parent.getId(), cat.getId())) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_OWN_PARENT, cat.getSlug());
            }
            cat.setParentId(parent.getId());
        }
    }

    private void importGroups(JsonNode groups, Counters n) {
        int i = 0;
        for (JsonNode g : groups) {
            i++;
            String key = text(g, "key");
            if (key == null || !KEY.matcher(key).matches() || key.length() > 32) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_BAD_GROUP_KEY, key);
            }
            SpecGroup row = groupRepository.findById(key).orElseGet(SpecGroup::new);
            row.setKey(key);
            String ru = text(g, "label_ru");
            row.setLabelRu(cut(ru == null ? (row.getLabelRu() == null ? key : row.getLabelRu()) : ru, 64));
            row.setLabelUk(cut(firstNonNull(text(g, "label_uk"), row.getLabelUk(), row.getLabelRu()), 64));
            row.setLabelEn(cut(firstNonNull(text(g, "label_en"), row.getLabelEn(), row.getLabelRu()), 64));
            Integer sort = intOrNull(g, "sort");
            row.setSortOrder(sort != null ? sort : i * 10);
            groupRepository.save(row);
            n.groups++;
        }
    }

    private void importBrands(JsonNode brands, Counters n) {
        if (!brands.isArray() || brands.isEmpty()) {
            return;
        }
        List<Brand> existing = new ArrayList<>(brandRepository.findAll());
        for (JsonNode b : brands) {
            String name = text(b, "name");
            if (name == null) {
                continue;
            }
            String slug = slug(text(b, "slug"));
            Brand row = null;
            for (Brand e : existing) {
                if ((slug != null && slug.equals(e.getSlug())) || e.getName().equalsIgnoreCase(name)) {
                    row = e;
                    break;
                }
            }
            if (row == null) {
                row = new Brand();
                row.setName(cut(name, 128));
                String base = slug != null ? slug : SlugService.slugify(name);
                row.setSlug(SlugService.uniquify(base.isEmpty() ? "brand" : base,
                        s -> existing.stream().anyMatch(e -> e.getSlug().equals(s))));
                n.brandCreated++;
                existing.add(row);
            } else {
                n.brandUpdated++;
            }
            List<String> aliases = new ArrayList<>(row.aliasList());
            for (JsonNode a : b.path("aliases")) {
                String s = a.asText("").trim();
                if (!s.isEmpty() && !s.equals(row.getName()) && !aliases.contains(s)) {
                    aliases.add(s);
                }
            }
            row.setAliasList(aliases);
            if (text(b, "website") != null) {
                row.setWebsite(cut(text(b, "website"), 255));
            }
            brandRepository.save(row);
        }
    }

    /** facet.style "buckets" → stored buckets; "values" / "range_slider" / none → null. */
    static String bucketsJson(JsonNode facet) {
        if (!facet.isObject() || !"buckets".equals(facet.path("style").asText())) {
            return null;
        }
        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (JsonNode b : facet.path("buckets")) {
            Double min = b.hasNonNull("min") && b.get("min").isNumber() ? b.get("min").asDouble() : null;
            Double max = b.hasNonNull("max") && b.get("max").isNumber() ? b.get("max").asDouble() : null;
            if (min == null && max == null) {
                continue;
            }
            if (!ids.add(CatalogSnapshot.bucketId(min, max))) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("min", min);
            m.put("max", max);
            String ru = text(b, "label_ru");
            m.put("label_ru", ru == null ? CatalogSnapshot.bucketId(min, max) : ru);
            m.put("label_uk", firstNonNull(text(b, "label_uk"), ru, null));
            m.put("label_en", firstNonNull(text(b, "label_en"), ru, null));
            out.add(m);
        }
        return SpecsJson.write(out);
    }

    /** name_uk / name_en → CATEGORY name translations of the current Russian name (origin AI). */
    private void writeName(Category cat, JsonNode c, Counters n) {
        String source = cat.getName();
        if (source == null) {
            return;
        }
        String hash = SourceHash.sha256Hex(source);
        for (String locale : ContentLocale.TRANSLATED) {
            String text = text(c, "name_" + locale);
            if (text == null) {
                continue;
            }
            StoredTranslations.Stored row = translations
                    .find(TranslationEntityType.CATEGORY, cat.getId(), TranslationEntityType.NAME, locale).orElse(null);
            if (row != null && Objects.equals(row.text(), text) && hash.equals(row.sourceHash())) {
                continue;
            }
            translations.write(TranslationEntityType.CATEGORY, cat.getId(), TranslationEntityType.NAME, locale, text,
                    source, TranslationOrigin.AI, null);
        }
    }

    // ------------------------------------------------------------------ helpers

    static String text(JsonNode n, String field) {
        JsonNode v = n == null ? null : n.get(field);
        if (v == null || v.isNull() || v.isContainerNode()) {
            return null;
        }
        String s = v.asText().trim();
        return s.isEmpty() ? null : s;
    }

    static Integer intOrNull(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v != null && v.isNumber() ? v.asInt() : null;
    }

    static String slug(String s) {
        if (s == null) {
            return null;
        }
        String out = SlugService.slugify(s);
        return out.isEmpty() ? null : out;
    }

    static String cut(String s, int max) {
        return s == null ? null : (s.length() > max ? s.substring(0, max) : s);
    }

    @SafeVarargs
    static <T> T firstNonNull(T... values) {
        for (T v : values) {
            if (v != null) {
                return v;
            }
        }
        return null;
    }

}
