package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.catalog.app.CatalogDtos.OptionInput;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.SpecAttribute;
import com.maxsolch.shop.catalog.domain.SpecOption;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.catalog.infra.SpecOptionRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/**
 * The values of a characteristic as the products store them: reading every product's specs, replacing the options of
 * an attribute and renaming/merging/removing one option value with the rewrite of the products' specs. Runs inside the
 * transaction of the calling {@link SpecAttributeAdminService} method.
 */
@Component
class SpecValues {


    private final SpecOptionRepository optionRepository;
    private final ProductRepository productRepository;
    private final CatalogDirectory directory;

    SpecValues(SpecOptionRepository optionRepository, ProductRepository productRepository,
               CatalogDirectory directory) {
        this.optionRepository = optionRepository;
        this.productRepository = productRepository;
        this.directory = directory;
    }

    /** One product's stored characteristics. */
    record SpecsRow(byte[] id, String categoryId, Map<String, Object> specs) {
    }


    /** PATCH semantics: the list replaces the options; removing a used one needs {@code force}. */
    void replaceOptions(SpecAttribute a, List<OptionInput> inputs, boolean force, List<SpecsRow> rows) {
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
                throw new DomainException.BadRequest(CatalogError.OPTION_VALUE_INVALID, String.valueOf(in.value()));
            }
            if (!keep.add(value)) {
                throw new DomainException.BadRequest(CatalogError.OPTION_DUPLICATE, value);
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
                throw new DomainException.Conflict(CatalogError.OPTION_IN_USE, o.getLabelRu(), String.valueOf(used)).withDetails(Map.of("count", used, "value", o.getValue()));
            }
            if (used > 0) {
                rewriteValue(rows, a.getKey(), o.getValue(), null);
            }
            optionRepository.delete(o);
        }
    }

    void renameOption(SpecAttribute a, String from, String to, List<SpecsRow> rows) {
        String f = trimToNull(from);
        String t = trimToNull(to);
        if (f == null || t == null || !CatalogSchemaImporter.VALUE.matcher(t).matches()) {
            throw new DomainException.BadRequest(CatalogError.RENAME_OPTION_INVALID);
        }
        if (f.equals(t)) {
            return;
        }
        List<SpecOption> options = optionRepository.findByAttribute(a.getId());
        SpecOption src = options.stream().filter(o -> o.getValue().equals(f)).findFirst()
                .orElseThrow(() -> new DomainException.NotFound(CatalogError.OPTION_NOT_FOUND, f));
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

    void stripKey(List<SpecsRow> rows, String key) {
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
    List<SpecsRow> scoped(SpecAttribute a) {
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
}
