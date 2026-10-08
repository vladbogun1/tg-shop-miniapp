package com.maxsolch.shop.catalog;

import com.maxsolch.shop.catalog.CatalogDtos.AdminBucketDto;
import com.maxsolch.shop.catalog.CatalogDtos.AdminOptionDto;
import com.maxsolch.shop.catalog.CatalogDtos.AdminSpecAttributeDto;
import com.maxsolch.shop.catalog.CatalogDtos.AdminSpecGroupDto;
import com.maxsolch.shop.catalog.CatalogDtos.BucketInput;
import com.maxsolch.shop.catalog.CatalogDtos.OptionInput;
import com.maxsolch.shop.catalog.CatalogDtos.RenameOption;
import com.maxsolch.shop.catalog.CatalogDtos.SpecAttributeUpsertRequest;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import com.maxsolch.shop.web.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.maxsolch.shop.common.Texts.trimToNull;

/**
 * Admin editing of the characteristics (§3.2): attributes with their options and buckets, and the
 * groups. Changes that would orphan stored values are refused with 409 unless forced, in which case
 * the products' specs are rewritten in the same transaction.
 */
@Service
public class SpecAttributeAdminService {

    public static final String IN_USE = "ATTRIBUTE_IN_USE";
    public static final String OPTION_IN_USE = "OPTION_IN_USE";
    public static final String GROUP_IN_USE = "GROUP_IN_USE";

    private final SpecAttributeRepository attributeRepository;
    private final SpecOptionRepository optionRepository;
    private final SpecGroupRepository groupRepository;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final CatalogDirectory directory;

    public SpecAttributeAdminService(SpecAttributeRepository attributeRepository,
                                     SpecOptionRepository optionRepository, SpecGroupRepository groupRepository,
                                     CategoryRepository categoryRepository, ProductRepository productRepository,
                                     CatalogDirectory directory) {
        this.attributeRepository = attributeRepository;
        this.optionRepository = optionRepository;
        this.groupRepository = groupRepository;
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.directory = directory;
    }

    /** One product's stored characteristics. */
    record SpecsRow(byte[] id, String categoryId, Map<String, Object> specs) {
    }

    // ------------------------------------------------------------------ read

    /**
     * {@code categoryId} null/blank = the global attributes; otherwise the category's own ones plus the
     * inherited (global + ancestors) with {@code inherited = true}.
     */
    @Transactional(readOnly = true)
    public List<AdminSpecAttributeDto> list(String categoryId) {
        CatalogSnapshot s = directory.load();
        List<SpecsRow> rows = specsRows();
        String cid = trimToNull(categoryId);
        if (cid != null && s.category(cid) == null) {
            throw new NotFoundException("category not found");
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
                .orElseThrow(), specsRows(), false);
    }

    // ------------------------------------------------------------------ write

    @Transactional
    public AdminSpecAttributeDto create(SpecAttributeUpsertRequest req) {
        SpecAttribute a = new SpecAttribute();
        String cid = trimToNull(req.categoryId());
        if (cid != null) {
            a.setCategoryId(categoryRepository.findById(bytes(cid, "category"))
                    .orElseThrow(() -> new NotFoundException("category not found")).getId());
        }
        String key = trimToNull(req.key());
        if (key == null || !CatalogSchemaImporter.KEY.matcher(key).matches()) {
            throw new BadRequestException("key: snake_case латиницей (a-z, 0-9, _), до 48 символов");
        }
        a.setKey(key);
        SpecType type = SpecType.parse(req.type());
        if (type == null) {
            throw new BadRequestException("type: number | enum | multi | bool | text");
        }
        a.setType(type);
        if (trimToNull(req.labelRu()) == null) {
            throw new BadRequestException("labelRu: укажите подпись");
        }
        apply(a, req);
        if (a.getGroupKey() == null) {
            a.setGroupKey("main");
        }
        a = attributeRepository.save(a);
        if (req.options() != null) {
            replaceOptions(a, req.options(), true, List.of());
        }
        attributeRepository.flush();
        CategoryRules.checkKeys(directory.load());
        directory.evictAll();
        return get(UuidUtil.toString(a.getId()));
    }

    @Transactional
    public AdminSpecAttributeDto update(String id, SpecAttributeUpsertRequest req, boolean force) {
        SpecAttribute a = load(id);
        List<SpecsRow> rows = scoped(a);
        long used = rows.stream().filter(r -> r.specs().containsKey(a.getKey())).count();
        String key = trimToNull(req.key());
        if (key != null && !key.equals(a.getKey())) {
            if (!CatalogSchemaImporter.KEY.matcher(key).matches()) {
                throw new BadRequestException("key: snake_case латиницей (a-z, 0-9, _), до 48 символов");
            }
            if (used > 0) {
                throw new ConflictException("ключ «" + a.getKey() + "» уже заполнен у " + used
                        + " товаров — его нельзя переименовать", IN_USE, Map.of("count", used));
            }
            a.setKey(key);
        }
        SpecType type = req.type() == null ? null : SpecType.parse(req.type());
        if (req.type() != null && type == null) {
            throw new BadRequestException("type: number | enum | multi | bool | text");
        }
        if (type != null && type != a.getType()) {
            if (used > 0 && !force) {
                throw new ConflictException("характеристика заполнена у " + used + " товаров — смена типа сотрёт "
                        + "значения (force=1)", IN_USE, Map.of("count", used));
            }
            if (used > 0) {
                stripKey(rows, a.getKey());
            }
            a.setType(type);
        }
        if (req.categoryId() != null) {
            String cid = trimToNull(req.categoryId());
            byte[] newCat = cid == null ? null : categoryRepository.findById(bytes(cid, "category"))
                    .orElseThrow(() -> new NotFoundException("category not found")).getId();
            if (!java.util.Arrays.equals(newCat, a.getCategoryId())) {
                if (used > 0) {
                    throw new ConflictException("характеристика заполнена у " + used + " товаров — её нельзя "
                            + "перенести в другую категорию", IN_USE, Map.of("count", used));
                }
                a.setCategoryId(newCat);
            }
        }
        apply(a, req);
        attributeRepository.save(a);
        if (req.renameOptions() != null) {
            for (RenameOption r : req.renameOptions()) {
                renameOption(a, r.from(), r.to(), scoped(a));
            }
        }
        if (req.options() != null && (a.getType() == SpecType.ENUM || a.getType() == SpecType.MULTI)) {
            replaceOptions(a, req.options(), force, scoped(a));
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
        renameOption(a, from, to, scoped(a));
        directory.evictAll();
        return get(id);
    }

    @Transactional
    public String delete(String id, boolean force) {
        SpecAttribute a = load(id);
        List<SpecsRow> rows = scoped(a);
        long used = rows.stream().filter(r -> r.specs().containsKey(a.getKey())).count();
        if (used > 0 && !force) {
            throw new ConflictException("характеристика «" + a.getLabelRu() + "» заполнена у " + used + " товаров",
                    IN_USE, Map.of("count", used));
        }
        stripKey(rows, a.getKey());
        for (SpecOption o : optionRepository.findByAttribute(a.getId())) {
            optionRepository.delete(o);
        }
        attributeRepository.delete(a);
        directory.evictAll();
        return a.getKey();
    }

    // ------------------------------------------------------------------ groups

    @Transactional(readOnly = true)
    public List<AdminSpecGroupDto> groups() {
        return directory.load().groups().stream()
                .map(g -> new AdminSpecGroupDto(g.key(), g.labelRu(), g.labelUk(), g.labelEn(), g.sort()))
                .toList();
    }

    /** Replaces the whole list; removing a group that attributes use → 409 GROUP_IN_USE. */
    @Transactional
    public List<AdminSpecGroupDto> putGroups(List<AdminSpecGroupDto> groups) {
        if (groups == null) {
            throw new BadRequestException("groups required");
        }
        Set<String> keep = new HashSet<>();
        int i = 0;
        for (AdminSpecGroupDto g : groups) {
            i++;
            String key = trimToNull(g.key());
            if (key == null || !CatalogSchemaImporter.KEY.matcher(key).matches() || key.length() > 32) {
                throw new BadRequestException("group key «" + g.key() + "»: a-z, 0-9, _");
            }
            if (!keep.add(key)) {
                throw new BadRequestException("group «" + key + "» twice");
            }
            SpecGroup row = groupRepository.findById(key).orElseGet(SpecGroup::new);
            row.setKey(key);
            String ru = trimToNull(g.labelRu()) == null ? key : g.labelRu().trim();
            row.setLabelRu(ru);
            row.setLabelUk(trimToNull(g.labelUk()) == null ? ru : g.labelUk().trim());
            row.setLabelEn(trimToNull(g.labelEn()) == null ? ru : g.labelEn().trim());
            row.setSortOrder(g.sort() == null ? i * 10 : g.sort());
            groupRepository.save(row);
        }
        Set<String> used = new HashSet<>();
        for (SpecAttribute a : attributeRepository.findAll()) {
            used.add(a.getGroupKey());
        }
        for (SpecGroup g : groupRepository.findAll()) {
            if (!keep.contains(g.getKey())) {
                if (used.contains(g.getKey())) {
                    throw new ConflictException("группа «" + g.getLabelRu() + "» используется характеристиками",
                            GROUP_IN_USE);
                }
                groupRepository.delete(g);
            }
        }
        directory.evictAll();
        groupRepository.flush();
        return groups();
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
            if (g == null || groupRepository.findById(g).isEmpty()) {
                throw new BadRequestException("group «" + req.group() + "» не найдена");
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
                throw new BadRequestException("бакет: «от» больше «до»");
            }
            String id = CatalogSnapshot.bucketId(b.min(), b.max());
            if (!ids.add(id)) {
                throw new BadRequestException("бакет " + id + " повторяется");
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

    /** PATCH semantics: the list replaces the options; removing a used one needs {@code force}. */
    private void replaceOptions(SpecAttribute a, List<OptionInput> inputs, boolean force, List<SpecsRow> rows) {
        Map<String, SpecOption> existing = new LinkedHashMap<>();
        for (SpecOption o : optionRepository.findByAttribute(a.getId())) {
            existing.put(o.getValue(), o);
        }
        Set<String> keep = new HashSet<>();
        int i = 0;
        for (OptionInput in : inputs) {
            i++;
            String value = trimToNull(in.value());
            if (value == null || !CatalogSchemaImporter.VALUE.matcher(value).matches()) {
                throw new BadRequestException("значение опции «" + in.value() + "»: a-z, 0-9, _ . + -");
            }
            if (!keep.add(value)) {
                throw new BadRequestException("опция «" + value + "» повторяется");
            }
            SpecOption o = existing.get(value);
            if (o == null) {
                o = new SpecOption();
                o.setAttributeId(a.getId());
                o.setValue(value);
            }
            String ru = trimToNull(in.labelRu()) == null ? (o.getLabelRu() == null ? value : o.getLabelRu())
                    : in.labelRu().trim();
            o.setLabelRu(ru);
            o.setLabelUk(trimToNull(in.labelUk()) == null ? ru : in.labelUk().trim());
            o.setLabelEn(trimToNull(in.labelEn()) == null ? ru : in.labelEn().trim());
            if (in.aliases() != null) {
                o.setAliasList(in.aliases());
            }
            o.setSortOrder(in.sort() == null ? i * 10 : in.sort());
            optionRepository.save(o);
        }
        for (SpecOption o : existing.values()) {
            if (keep.contains(o.getValue())) {
                continue;
            }
            long used = rows.stream().filter(r -> usesValue(r.specs().get(a.getKey()), o.getValue())).count();
            if (used > 0 && !force) {
                throw new ConflictException("вариант «" + o.getLabelRu() + "» выбран у " + used + " товаров",
                        OPTION_IN_USE, Map.of("count", used, "value", o.getValue()));
            }
            if (used > 0) {
                rewriteValue(rows, a.getKey(), o.getValue(), null);
            }
            optionRepository.delete(o);
        }
    }

    private void renameOption(SpecAttribute a, String from, String to, List<SpecsRow> rows) {
        String f = trimToNull(from);
        String t = trimToNull(to);
        if (f == null || t == null || !CatalogSchemaImporter.VALUE.matcher(t).matches()) {
            throw new BadRequestException("renameOption: from/to — значения опций (a-z, 0-9, _ . + -)");
        }
        if (f.equals(t)) {
            return;
        }
        List<SpecOption> options = optionRepository.findByAttribute(a.getId());
        SpecOption src = options.stream().filter(o -> o.getValue().equals(f)).findFirst()
                .orElseThrow(() -> new NotFoundException("option «" + f + "» not found"));
        SpecOption dst = options.stream().filter(o -> o.getValue().equals(t)).findFirst().orElse(null);
        if (dst == null) {
            src.setValue(t);
            optionRepository.save(src);
        } else {
            // Merge: the target keeps its labels and gains the source's aliases.
            List<String> aliases = new ArrayList<>(dst.aliasList());
            aliases.addAll(src.aliasList());
            aliases.add(src.getLabelRu());
            dst.setAliasList(aliases);
            optionRepository.save(dst);
            optionRepository.delete(src);
        }
        optionRepository.flush();
        rewriteValue(rows, a.getKey(), f, t);
    }

    /** Replaces (to != null) or removes (to == null) one option value in every product's specs. */
    private void rewriteValue(List<SpecsRow> rows, String key, String from, String to) {
        for (SpecsRow r : rows) {
            Object v = r.specs().get(key);
            if (!usesValue(v, from)) {
                continue;
            }
            if (v instanceof String) {
                if (to == null) {
                    r.specs().remove(key);
                } else {
                    r.specs().put(key, to);
                }
            } else if (v instanceof List<?> l) {
                List<Object> next = new ArrayList<>();
                for (Object x : l) {
                    Object y = from.equals(x) ? to : x;
                    if (y != null && !next.contains(y)) {
                        next.add(y);
                    }
                }
                if (next.isEmpty()) {
                    r.specs().remove(key);
                } else {
                    r.specs().put(key, next);
                }
            }
            productRepository.updateSpecs(r.id(), SpecsJson.write(r.specs()));
        }
    }

    private void stripKey(List<SpecsRow> rows, String key) {
        for (SpecsRow r : rows) {
            if (r.specs().remove(key) != null) {
                productRepository.updateSpecs(r.id(), SpecsJson.write(r.specs()));
            }
        }
    }

    static boolean usesValue(Object v, String value) {
        return value.equals(v) || (v instanceof List<?> l && l.contains(value));
    }

    private static boolean inScope(CatalogSnapshot s, SpecsRow r, SpecAttribute a) {
        if (a.getCategoryId() == null) {
            return true;
        }
        return r.categoryId() != null && s.path(r.categoryId()).stream()
                .anyMatch(c -> c.id().equals(UuidUtil.toString(a.getCategoryId())));
    }

    /** Products the attribute applies to (its category subtree; every product for a global one). */
    private List<SpecsRow> scoped(SpecAttribute a) {
        CatalogSnapshot s = directory.load();
        return specsRows().stream().filter(r -> inScope(s, r, a)).toList();
    }

    List<SpecsRow> specsRows() {
        List<SpecsRow> out = new ArrayList<>();
        for (Object[] r : productRepository.specsRows()) {
            Map<String, Object> specs = SpecsJson.readMap((String) r[2]);
            if (!specs.isEmpty()) {
                out.add(new SpecsRow((byte[]) r[0], r[1] == null ? null : UuidUtil.toString((byte[]) r[1]), specs));
            }
        }
        return out;
    }

    private AdminSpecAttributeDto dto(CatalogSnapshot s, CatalogSnapshot.Attr a, List<SpecsRow> rows,
                                      boolean inherited) {
        Set<String> scope = a.categoryId() == null ? null : s.subtree(a.categoryId());
        List<SpecsRow> relevant = rows.stream()
                .filter(r -> scope == null || (r.categoryId() != null && scope.contains(r.categoryId())))
                .filter(r -> r.specs().containsKey(a.key()))
                .toList();
        Map<String, Long> optionUse = new HashMap<>();
        for (SpecsRow r : relevant) {
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
                .orElseThrow(() -> new NotFoundException("attribute not found"));
    }

    static byte[] bytes(String id, String what) {
        try {
            return UuidUtil.toBytes(id.trim());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BadRequestException("invalid " + what + " id: " + id);
        }
    }
}
