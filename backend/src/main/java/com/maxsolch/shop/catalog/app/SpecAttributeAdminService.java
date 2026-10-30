package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CatalogErrors;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.CategoryRules;
import com.maxsolch.shop.catalog.domain.SpecAttribute;
import com.maxsolch.shop.catalog.domain.SpecGroup;
import com.maxsolch.shop.catalog.domain.SpecOption;
import com.maxsolch.shop.catalog.domain.SpecType;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.catalog.infra.CategoryRepository;
import com.maxsolch.shop.catalog.infra.SpecAttributeRepository;
import com.maxsolch.shop.catalog.infra.SpecGroupRepository;
import com.maxsolch.shop.catalog.infra.SpecOptionRepository;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminBucketDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminOptionDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminSpecAttributeDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminSpecGroupDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.BucketInput;
import com.maxsolch.shop.catalog.app.CatalogDtos.OptionInput;
import com.maxsolch.shop.catalog.app.CatalogDtos.RenameOption;
import com.maxsolch.shop.catalog.app.CatalogDtos.SpecAttributeUpsertRequest;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/**
 * Admin editing of the characteristics (§3.2): attributes with their options and buckets (the groups are
 * {@link SpecGroupAdminService}). Changes that would orphan stored values are refused with 409 unless forced, in which case
 * the products' specs are rewritten in the same transaction.
 */
@Service
public class SpecAttributeAdminService {

    public static final String IN_USE = "ATTRIBUTE_IN_USE";
    /** The group the characteristic dialog falls back to («Основное»). */
    static final String DEFAULT_GROUP = "main";

    private final SpecAttributeRepository attributeRepository;
    private final SpecOptionRepository optionRepository;
    private final SpecGroupRepository groupRepository;
    private final CategoryRepository categoryRepository;
    private final SpecValues values;
    private final CatalogDirectory directory;

    public SpecAttributeAdminService(SpecAttributeRepository attributeRepository,
                                     SpecOptionRepository optionRepository, SpecGroupRepository groupRepository,
                                     CategoryRepository categoryRepository, SpecValues values,
                                     CatalogDirectory directory) {
        this.attributeRepository = attributeRepository;
        this.optionRepository = optionRepository;
        this.groupRepository = groupRepository;
        this.categoryRepository = categoryRepository;
        this.values = values;
        this.directory = directory;
    }

    // ------------------------------------------------------------------ read

    /**
     * {@code categoryId} null/blank = the global attributes; otherwise the category's own ones plus the
     * inherited (global + ancestors) with {@code inherited = true}.
     */
    @Transactional(readOnly = true)
    public List<AdminSpecAttributeDto> list(String categoryId) {
        CatalogSnapshot s = directory.load();
        List<SpecValues.SpecsRow> rows = values.specsRows();
        String cid = trimToNull(categoryId);
        if (cid != null && s.category(cid) == null) {
            throw CatalogErrors.notFound("category not found");
        }
        List<CatalogSnapshot.Attr> attrs = cid == null
                ? s.attributes().stream().filter(a -> a.categoryId() == null).toList()
                : s.attributesFor(cid);
        return attrs.stream().map(a -> dto(s, a, rows, cid != null && !cid.equals(a.categoryId()))).toList();
    }

    @Transactional(readOnly = true)
    public AdminSpecAttributeDto get(String id) {
        CatalogSnapshot s = directory.load();
        SpecAttribute a = load(id);
        return dto(s, s.attributes().stream().filter(x -> x.id().equals(UuidUtil.toString(a.getId()))).findFirst()
                .orElseThrow(), values.specsRows(), false);
    }

    // ------------------------------------------------------------------ write

    @Transactional
    public AdminSpecAttributeDto create(SpecAttributeUpsertRequest req) {
        SpecAttribute a = new SpecAttribute();
        String cid = trimToNull(req.categoryId());
        if (cid != null) {
            a.setCategoryId(categoryRepository.findById(bytes(cid, "category"))
                    .orElseThrow(() -> CatalogErrors.notFound("category not found")).getId());
        }
        String key = trimToNull(req.key());
        if (key == null || !CatalogSchemaImporter.KEY.matcher(key).matches()) {
            throw CatalogErrors.badRequest("key: snake_case латиницей (a-z, 0-9, _), до 48 символов");
        }
        a.setKey(key);
        SpecType type = SpecType.parse(req.type());
        if (type == null) {
            throw CatalogErrors.badRequest("type: number | enum | multi | bool | text");
        }
        a.setType(type);
        if (trimToNull(req.labelRu()) == null) {
            throw CatalogErrors.badRequest("labelRu: укажите подпись");
        }
        apply(a, req);
        if (a.getGroupKey() == null) {
            a.setGroupKey("main");
        }
        a = attributeRepository.save(a);
        if (req.options() != null) {
            values.replaceOptions(a, req.options(), true, List.of());
        }
        attributeRepository.flush();
        CategoryRules.checkKeys(directory.load());
        directory.evictAll();
        return get(UuidUtil.toString(a.getId()));
    }

    @Transactional
    public AdminSpecAttributeDto update(String id, SpecAttributeUpsertRequest req, boolean force) {
        SpecAttribute a = load(id);
        List<SpecValues.SpecsRow> rows = values.scoped(a);
        long used = rows.stream().filter(r -> r.specs().containsKey(a.getKey())).count();
        String key = trimToNull(req.key());
        if (key != null && !key.equals(a.getKey())) {
            if (!CatalogSchemaImporter.KEY.matcher(key).matches()) {
                throw CatalogErrors.badRequest("key: snake_case латиницей (a-z, 0-9, _), до 48 символов");
            }
            if (used > 0) {
                throw CatalogErrors.conflict("ключ «" + a.getKey() + "» уже заполнен у " + used
                        + " товаров — его нельзя переименовать", IN_USE, Map.of("count", used));
            }
            a.setKey(key);
        }
        SpecType type = req.type() == null ? null : SpecType.parse(req.type());
        if (req.type() != null && type == null) {
            throw CatalogErrors.badRequest("type: number | enum | multi | bool | text");
        }
        if (type != null && type != a.getType()) {
            if (used > 0 && !force) {
                throw CatalogErrors.conflict("характеристика заполнена у " + used + " товаров — смена типа сотрёт "
                        + "значения (force=1)", IN_USE, Map.of("count", used));
            }
            if (used > 0) {
                values.stripKey(rows, a.getKey());
            }
            a.setType(type);
        }
        if (req.categoryId() != null) {
            String cid = trimToNull(req.categoryId());
            byte[] newCat = cid == null ? null : categoryRepository.findById(bytes(cid, "category"))
                    .orElseThrow(() -> CatalogErrors.notFound("category not found")).getId();
            if (!java.util.Arrays.equals(newCat, a.getCategoryId())) {
                if (used > 0) {
                    throw CatalogErrors.conflict("характеристика заполнена у " + used + " товаров — её нельзя "
                            + "перенести в другую категорию", IN_USE, Map.of("count", used));
                }
                a.setCategoryId(newCat);
            }
        }
        apply(a, req);
        attributeRepository.save(a);
        if (req.renameOptions() != null) {
            for (RenameOption r : req.renameOptions()) {
                values.renameOption(a, r.from(), r.to(), values.scoped(a));
            }
        }
        if (req.options() != null && (a.getType() == SpecType.ENUM || a.getType() == SpecType.MULTI)) {
            values.replaceOptions(a, req.options(), force, values.scoped(a));
        }
        attributeRepository.flush();
        CategoryRules.checkKeys(directory.load());
        directory.evictAll();
        return get(id);
    }

    /** Renames an option value (or merges it into an existing one) and rewrites the specs. */
    @Transactional
    public AdminSpecAttributeDto renameOption(String id, String from, String to) {
        SpecAttribute a = load(id);
        values.renameOption(a, from, to, values.scoped(a));
        directory.evictAll();
        return get(id);
    }

    @Transactional
    public String delete(String id, boolean force) {
        SpecAttribute a = load(id);
        List<SpecValues.SpecsRow> rows = values.scoped(a);
        long used = rows.stream().filter(r -> r.specs().containsKey(a.getKey())).count();
        if (used > 0 && !force) {
            throw CatalogErrors.conflict("характеристика «" + a.getLabelRu() + "» заполнена у " + used + " товаров",
                    IN_USE, Map.of("count", used));
        }
        values.stripKey(rows, a.getKey());
        for (SpecOption o : optionRepository.findByAttribute(a.getId())) {
            optionRepository.delete(o);
        }
        attributeRepository.delete(a);
        directory.evictAll();
        return a.getKey();
    }

    // ------------------------------------------------------------------ internals

    private void apply(SpecAttribute a, SpecAttributeUpsertRequest req) {
        if (req.labelRu() != null && trimToNull(req.labelRu()) != null) {
            a.setLabelRu(req.labelRu().trim());
        }
        if (req.labelUk() != null) {
            a.setLabelUk(trimToNull(req.labelUk()));
        }
        if (req.labelEn() != null) {
            a.setLabelEn(trimToNull(req.labelEn()));
        }
        if (a.getLabelUk() == null) {
            a.setLabelUk(a.getLabelRu());
        }
        if (a.getLabelEn() == null) {
            a.setLabelEn(a.getLabelRu());
        }
        if (req.unitRu() != null) {
            a.setUnitRu(trimToNull(req.unitRu()));
        }
        if (req.unitUk() != null) {
            a.setUnitUk(trimToNull(req.unitUk()));
        }
        if (req.unitEn() != null) {
            a.setUnitEn(trimToNull(req.unitEn()));
        }
        if (req.range() != null) {
            a.setRange(req.range() && a.getType() == SpecType.NUMBER);
        }
        if (req.group() != null) {
            String g = trimToNull(req.group());
            if (DEFAULT_GROUP.equals(g) && groupRepository.findById(g).isEmpty()) {
                // With no groups yet the dialog offers «Основное» — create it instead of failing.
                SpecGroup main = new SpecGroup();
                main.setKey(DEFAULT_GROUP);
                main.setLabelRu("Основное");
                main.setLabelUk("Основне");
                main.setLabelEn("General");
                groupRepository.save(main);
            }
            if (g == null || groupRepository.findById(g).isEmpty()) {
                throw CatalogErrors.badRequest("group «" + req.group() + "» не найдена");
            }
            a.setGroupKey(g);
        }
        if (req.filterable() != null) {
            a.setFilterable(req.filterable());
        }
        if (req.comparable() != null) {
            a.setComparable(req.comparable());
        }
        if (req.required() != null) {
            a.setRequired(req.required());
        }
        if (req.highlight() != null) {
            a.setHighlight(req.highlight());
        }
        if (req.sort() != null) {
            a.setSortOrder(req.sort());
        }
        if (req.hint() != null) {
            a.setHint(trimToNull(req.hint()));
        }
        if (req.buckets() != null) {
            a.setBucketsJson(a.getType() == SpecType.NUMBER ? bucketsJson(req.buckets()) : null);
        }
        if (a.getType() != SpecType.NUMBER) {
            a.setRange(false);
            a.setBucketsJson(null);
        }
    }

    static String bucketsJson(List<BucketInput> buckets) {
        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (BucketInput b : buckets) {
            if (b == null || (b.min() == null && b.max() == null)) {
                continue;
            }
            if (b.min() != null && b.max() != null && b.min() > b.max()) {
                throw CatalogErrors.badRequest("бакет: «от» больше «до»");
            }
            String id = CatalogSnapshot.bucketId(b.min(), b.max());
            if (!ids.add(id)) {
                throw CatalogErrors.badRequest("бакет " + id + " повторяется");
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("min", b.min());
            m.put("max", b.max());
            String ru = trimToNull(b.labelRu()) == null ? id : b.labelRu().trim();
            m.put("label_ru", ru);
            m.put("label_uk", trimToNull(b.labelUk()) == null ? ru : b.labelUk().trim());
            m.put("label_en", trimToNull(b.labelEn()) == null ? ru : b.labelEn().trim());
            out.add(m);
        }
        return SpecsJson.write(out);
    }

    private AdminSpecAttributeDto dto(CatalogSnapshot s, CatalogSnapshot.Attr a, List<SpecValues.SpecsRow> rows,
                                      boolean inherited) {
        Set<String> scope = a.categoryId() == null ? null : s.subtree(a.categoryId());
        List<SpecValues.SpecsRow> relevant = rows.stream()
                .filter(r -> scope == null || (r.categoryId() != null && scope.contains(r.categoryId())))
                .filter(r -> r.specs().containsKey(a.key()))
                .toList();
        Map<String, Long> optionUse = new HashMap<>();
        for (SpecValues.SpecsRow r : relevant) {
            Object v = r.specs().get(a.key());
            if (v instanceof String str) {
                optionUse.merge(str, 1L, Long::sum);
            } else if (v instanceof List<?> l) {
                for (Object x : l) {
                    optionUse.merge(String.valueOf(x), 1L, Long::sum);
                }
            }
        }
        List<AdminOptionDto> options = a.options().stream()
                .map(o -> new AdminOptionDto(o.value(), o.labelRu(), o.labelUk(), o.labelEn(), o.aliases(), o.sort(),
                        optionUse.getOrDefault(o.value(), 0L)))
                .toList();
        List<AdminBucketDto> buckets = a.buckets() == null ? null : a.buckets().stream()
                .map(b -> new AdminBucketDto(b.id(), b.min(), b.max(), b.labelRu(), b.labelUk(), b.labelEn()))
                .toList();
        return new AdminSpecAttributeDto(a.id(), a.categoryId(), a.key(), a.labelRu(), a.labelUk(), a.labelEn(),
                a.type().json(), a.unitRu(), a.unitUk(), a.unitEn(), a.range(), a.group(), a.filterable(),
                a.comparable(), a.required(), a.highlight(), a.sort(), buckets, a.hint(), options, inherited,
                relevant.size());
    }

    private SpecAttribute load(String id) {
        return attributeRepository.findById(bytes(id, "attribute"))
                .orElseThrow(() -> CatalogErrors.notFound("attribute not found"));
    }

    static byte[] bytes(String id, String what) {
        try {
            return UuidUtil.toBytes(id.trim());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw CatalogErrors.badRequest("invalid " + what + " id: " + id);
        }
    }
}
