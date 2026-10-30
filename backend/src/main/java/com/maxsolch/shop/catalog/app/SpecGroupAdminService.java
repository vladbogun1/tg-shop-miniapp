package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.app.CatalogDtos.AdminSpecGroupDto;
import com.maxsolch.shop.catalog.domain.CatalogErrors;
import com.maxsolch.shop.catalog.domain.SpecAttribute;
import com.maxsolch.shop.catalog.domain.SpecGroup;
import com.maxsolch.shop.catalog.infra.SpecAttributeRepository;
import com.maxsolch.shop.catalog.infra.SpecGroupRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/** Admin editing of the characteristic groups (§3.2): the whole list is replaced at once. */
@Service
public class SpecGroupAdminService {

    public static final String GROUP_IN_USE = "GROUP_IN_USE";

    private final SpecAttributeRepository attributeRepository;
    private final SpecGroupRepository groupRepository;
    private final CatalogDirectory directory;

    public SpecGroupAdminService(SpecAttributeRepository attributeRepository, SpecGroupRepository groupRepository,
                                 CatalogDirectory directory) {
        this.attributeRepository = attributeRepository;
        this.groupRepository = groupRepository;
        this.directory = directory;
    }


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
            throw CatalogErrors.badRequest("groups required");
        }
        Set<String> keep = new HashSet<>();
        int i = 0;
        for (AdminSpecGroupDto g : groups) {
            i++;
            String key = trimToNull(g.key());
            if (key == null || !CatalogSchemaImporter.KEY.matcher(key).matches() || key.length() > 32) {
                throw CatalogErrors.badRequest("group key «" + g.key() + "»: a-z, 0-9, _");
            }
            if (!keep.add(key)) {
                throw CatalogErrors.badRequest("group «" + key + "» twice");
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
                    throw CatalogErrors.conflict("группа «" + g.getLabelRu() + "» используется характеристиками",
                            GROUP_IN_USE);
                }
                groupRepository.delete(g);
            }
        }
        directory.evictAll();
        groupRepository.flush();
        return groups();
    }

}
