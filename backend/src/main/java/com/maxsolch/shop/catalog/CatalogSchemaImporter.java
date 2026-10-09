package com.maxsolch.shop.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.service.SlugService;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.translation.ContentTranslation;
import com.maxsolch.shop.translation.ContentTranslationId;
import com.maxsolch.shop.translation.ContentTranslationRepository;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationOrigin;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.BadRequestException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

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
 * attributes and options → key collision check. Any violation rolls the whole import back.
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
    private final SpecAttributeRepository attributeRepository;
    private final SpecOptionRepository optionRepository;
    private final ProductRepository productRepository;
    private final ContentTranslationRepository translationRepository;
    private final TranslationService translationService;
    private final CatalogDirectory directory;

    public CatalogSchemaImporter(CategoryRepository categoryRepository, BrandRepository brandRepository,
                                 SpecGroupRepository groupRepository, SpecAttributeRepository attributeRepository,
                                 SpecOptionRepository optionRepository, ProductRepository productRepository,
                                 ContentTranslationRepository translationRepository,
                                 TranslationService translationService, CatalogDirectory directory) {
        this.categoryRepository = categoryRepository;
        this.brandRepository = brandRepository;
        this.groupRepository = groupRepository;
        this.attributeRepository = attributeRepository;
        this.optionRepository = optionRepository;
        this.productRepository = productRepository;
        this.translationRepository = translationRepository;
        this.translationService = translationService;
        this.directory = directory;
    }

    private static final class Counters {
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
            throw new BadRequestException("body must be a JSON object (schema-draft.json format)");
        }
        Counters n = new Counters();
        importGroups(root.path("groups"), n);
        importBrands(root.path("brands"), n);

        // ---- categories, pass 1: rows without parents
        JsonNode cats = root.path("categories");
        List<Category> all = new ArrayList<>(categoryRepository.findAll());
        Map<String, Category> bySlug = new HashMap<>();
        for (Category c : all) {
            bySlug.put(c.getSlug(), c);
        }
        Set<String> importSlugs = new HashSet<>();
        for (JsonNode c : cats) {
            String slug = slug(text(c, "slug"));
            if (slug == null) {
                throw new BadRequestException("category without slug");
            }
            if (!importSlugs.add(slug)) {
                throw new BadRequestException("category slug «" + slug + "» twice in the import");
            }
        }
        Map<String, Category> imported = new LinkedHashMap<>();
        int index = 0;
        for (JsonNode c : cats) {
            index++;
            String slug = slug(text(c, "slug"));
            Category cat = bySlug.get(slug);
            if (cat == null) {
                for (JsonNode old : c.path("old_tag_slugs")) {
                    String o = slug(old.asText());
                    Category candidate = o == null ? null : bySlug.get(o);
                    // Take over an existing category, unless the import keeps that slug for itself.
                    if (candidate != null && !importSlugs.contains(o)) {
                        bySlug.remove(o);
                        cat = candidate;
                        n.warnings.add("категория «" + o + "» переименована в «" + slug + "»");
                        break;
                    }
                }
            }
            String nameRu = text(c, "name_ru");
            boolean created = cat == null;
            if (created) {
                if (nameRu == null) {
                    throw new BadRequestException("category «" + slug + "»: name_ru is required");
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
            cat = categoryRepository.save(cat);
            bySlug.put(slug, cat);
            imported.put(slug, cat);
            writeName(cat, c, n);
        }
        categoryRepository.flush();

        // ---- product moves (before parents: a category with products may become a parent)
        for (JsonNode m : root.path("product_moves")) {
            Category from = bySlug.get(slug(text(m, "from_category_slug")));
            Category to = bySlug.get(slug(text(m, "to_category_slug")));
            if (from == null || to == null) {
                throw new BadRequestException("product_moves: unknown category " + m);
            }
            int moved = productRepository.moveCategory(from.getId(), to.getId());
            n.moved += moved;
            n.warnings.add("перенесено товаров " + from.getSlug() + " → " + to.getSlug() + ": " + moved);
        }

        // ---- parents
        for (JsonNode c : cats) {
            Category cat = imported.get(slug(text(c, "slug")));
            String parentSlug = slug(text(c, "parent"));
            if (parentSlug == null) {
                cat.setParentId(null);
                continue;
            }
            Category parent = bySlug.get(parentSlug);
            if (parent == null) {
                throw new BadRequestException("category «" + cat.getSlug() + "»: unknown parent «" + parentSlug + "»");
            }
            if (Arrays.equals(parent.getId(), cat.getId())) {
                throw new BadRequestException("category «" + cat.getSlug() + "» is its own parent");
            }
            cat.setParentId(parent.getId());
        }
        List<Category> tree = categoryRepository.findAll();
        CategoryRules.checkTree(tree, id -> productRepository.countByCategory(id));
        categoryRepository.flush();

        // ---- attributes
        importAttributes(null, root.path("global_attributes"), n);
        for (JsonNode c : cats) {
            Category cat = imported.get(slug(text(c, "slug")));
            importAttributes(cat.getId(), c.path("attributes"), n);
        }
        attributeRepository.flush();
        optionRepository.flush();
        CategoryRules.checkKeys(directory.load());

        afterCommit(() -> translationService.invalidate());
        directory.evictAll();
        return new Result(n.groups, n.catCreated, n.catUpdated, n.attrCreated, n.attrUpdated, n.optCreated,
                n.optUpdated, n.brandCreated, n.brandUpdated, n.moved, n.warnings);
    }

    // ------------------------------------------------------------------ parts

    private void importGroups(JsonNode groups, Counters n) {
        int i = 0;
        for (JsonNode g : groups) {
            i++;
            String key = text(g, "key");
            if (key == null || !KEY.matcher(key).matches() || key.length() > 32) {
                throw new BadRequestException("group key «" + key + "»: a-z, 0-9, _ (≤ 32)");
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

    private void importAttributes(byte[] categoryId, JsonNode attrs, Counters n) {
        if (!attrs.isArray()) {
            return;
        }
        Map<String, SpecAttribute> existing = new HashMap<>();
        for (SpecAttribute a : attributeRepository.findAll()) {
            if (Arrays.equals(a.getCategoryId(), categoryId)) {
                existing.put(a.getKey(), a);
            }
        }
        for (JsonNode j : attrs) {
            String key = text(j, "key");
            if (key == null || !KEY.matcher(key).matches()) {
                throw new BadRequestException("attribute key «" + key + "»: snake_case a-z0-9_ (≤ 48)");
            }
            SpecType type = SpecType.parse(text(j, "type"));
            if (type == null) {
                throw new BadRequestException("attribute «" + key + "»: unknown type " + text(j, "type"));
            }
            SpecAttribute a = existing.get(key);
            if (a == null) {
                a = new SpecAttribute();
                a.setCategoryId(categoryId);
                a.setKey(key);
                n.attrCreated++;
            } else {
                n.attrUpdated++;
            }
            String ru = firstNonNull(text(j, "label_ru"), a.getLabelRu(), key);
            a.setLabelRu(cut(ru, 96));
            a.setLabelUk(cut(firstNonNull(text(j, "label_uk"), a.getLabelUk(), ru), 96));
            a.setLabelEn(cut(firstNonNull(text(j, "label_en"), a.getLabelEn(), ru), 96));
            a.setType(type);
            JsonNode unit = j.path("unit");
            if (unit.isObject()) {
                a.setUnitRu(cut(text(unit, "ru"), 24));
                a.setUnitUk(cut(text(unit, "uk"), 24));
                a.setUnitEn(cut(text(unit, "en"), 24));
            } else if (unit.isTextual()) {
                a.setUnitRu(cut(unit.asText(), 24));
                a.setUnitUk(cut(unit.asText(), 24));
                a.setUnitEn(cut(unit.asText(), 24));
            } else {
                a.setUnitRu(null);
                a.setUnitUk(null);
                a.setUnitEn(null);
            }
            a.setRange(type == SpecType.NUMBER && j.path("range").asBoolean(false));
            String group = firstNonNull(text(j, "group"), a.getGroupKey(), "main");
            a.setGroupKey(cut(group, 32));
            a.setFilterable(j.path("filterable").asBoolean(false));
            a.setComparable(j.path("comparable").asBoolean(false));
            a.setRequired(j.has("required_for_ready") ? j.path("required_for_ready").asBoolean(false)
                    : j.path("required").asBoolean(false));
            a.setHighlight(j.path("highlight").asBoolean(false));
            Integer sort = intOrNull(j, "sort");
            a.setSortOrder(sort != null ? sort : a.getSortOrder());
            a.setBucketsJson(type == SpecType.NUMBER ? bucketsJson(j.path("facet")) : null);
            String hint = firstNonNull(text(j, "hint_ru"), text(j, "hint"), null);
            a.setHint(hint);
            a = attributeRepository.save(a);
            existing.put(key, a);
            if (type == SpecType.ENUM || type == SpecType.MULTI) {
                importOptions(a, j.path("options"), n);
            }
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

    private void importOptions(SpecAttribute a, JsonNode options, Counters n) {
        Map<String, SpecOption> existing = new HashMap<>();
        int maxSort = 0;
        for (SpecOption o : optionRepository.findByAttribute(a.getId())) {
            existing.put(o.getValue(), o);
            maxSort = Math.max(maxSort, o.getSortOrder());
        }
        int i = 0;
        for (JsonNode j : options) {
            i++;
            String value = text(j, "value");
            if (value == null || !VALUE.matcher(value).matches()) {
                throw new BadRequestException("attribute «" + a.getKey() + "»: bad option value «" + value + "»");
            }
            SpecOption o = existing.get(value);
            if (o == null) {
                o = new SpecOption();
                o.setAttributeId(a.getId());
                o.setValue(value);
                n.optCreated++;
            } else {
                n.optUpdated++;
            }
            String ru = firstNonNull(text(j, "label_ru"), o.getLabelRu(), value);
            o.setLabelRu(cut(ru, 96));
            o.setLabelUk(cut(firstNonNull(text(j, "label_uk"), o.getLabelUk(), ru), 96));
            o.setLabelEn(cut(firstNonNull(text(j, "label_en"), o.getLabelEn(), ru), 96));
            List<String> aliases = new ArrayList<>();
            for (JsonNode al : j.path("aliases")) {
                aliases.add(al.asText(""));
            }
            if (j.has("aliases")) {
                o.setAliasList(aliases);
            }
            Integer sort = intOrNull(j, "sort");
            o.setSortOrder(sort != null ? sort : i * 10);
            optionRepository.save(o);
            existing.put(value, o);
        }
    }

    /** name_uk / name_en → CATEGORY name translations of the current Russian name (origin AI). */
    private void writeName(Category cat, JsonNode c, Counters n) {
        String source = cat.getName();
        if (source == null) {
            return;
        }
        String hash = TranslationService.sha256Hex(source);
        for (String locale : ContentLocale.TRANSLATED) {
            String text = text(c, "name_" + locale);
            if (text == null) {
                continue;
            }
            ContentTranslationId id = new ContentTranslationId(TranslationEntityType.CATEGORY, cat.getId(),
                    TranslationEntityType.NAME, locale);
            ContentTranslation row = translationRepository.findById(id).orElseGet(() -> new ContentTranslation(id));
            if (Objects.equals(row.getText(), text) && hash.equals(row.getSourceHash())) {
                continue;
            }
            row.setText(text);
            row.setSource(source);
            row.setOrigin(TranslationOrigin.AI);
            row.setReviewedAt(null);
            translationRepository.save(row);
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

    private static void afterCommit(Runnable r) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    r.run();
                }
            });
        } else {
            r.run();
        }
    }
}
