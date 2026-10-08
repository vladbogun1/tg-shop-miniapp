package com.maxsolch.shop.catalog;

import com.maxsolch.shop.catalog.CatalogDtos.AdminCategoryDto;
import com.maxsolch.shop.catalog.CatalogDtos.CategoryUpsertRequest;
import com.maxsolch.shop.catalog.CatalogDtos.ReorderItem;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.service.SlugService;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import com.maxsolch.shop.web.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;

import static com.maxsolch.shop.common.Texts.trimToNull;

/**
 * Admin CRUD of the category tree (docs/CATALOG-SPECS.md §3.2). Every change re-checks the tree
 * rules ({@link CategoryRules}) inside the transaction and drops the catalog caches after commit.
 */
@Service
public class CategoryAdminService {

    /** A saved category, the slug it had (null when new) and the SEO fields that changed (journal). */
    public record Saved(AdminCategoryDto category, String previousSlug, List<String> seoChanged) {
    }

    public record Deleted(String name, String slug) {
    }

    private final CategoryRepository repository;
    private final ProductRepository productRepository;
    private final SlugService slugService;
    private final TranslationService translationService;
    private final CatalogDirectory directory;

    public CategoryAdminService(CategoryRepository repository, ProductRepository productRepository,
                                SlugService slugService, TranslationService translationService,
                                CatalogDirectory directory) {
        this.repository = repository;
        this.productRepository = productRepository;
        this.slugService = slugService;
        this.translationService = translationService;
        this.directory = directory;
    }

    @Transactional(readOnly = true)
    public List<AdminCategoryDto> list() {
        CatalogSnapshot s = directory.load();
        Map<String, Long> active = counts(productRepository.countsByCategory(true));
        Map<String, Long> direct = counts(productRepository.countsByCategory(false));
        Map<String, Category> rows = new HashMap<>();
        for (Category c : repository.findAll()) {
            rows.put(UuidUtil.toString(c.getId()), c);
        }
        List<AdminCategoryDto> out = new ArrayList<>();
        for (CatalogSnapshot.Cat c : s.treeOrder()) {
            out.add(dto(s, rows.get(c.id()), active, direct));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public AdminCategoryDto get(String id) {
        Category c = load(id);
        CatalogSnapshot s = directory.load();
        return dto(s, c, counts(productRepository.countsByCategory(true)),
                counts(productRepository.countsByCategory(false)));
    }

    @Transactional
    public Saved create(CategoryUpsertRequest req) {
        String name = trimToNull(req.name());
        if (name == null) {
            throw new BadRequestException("name: укажите название категории");
        }
        Category c = new Category();
        c.setName(name);
        c.setParentId(parentId(req.parentId()));
        c.setShowInMenu(req.showInMenu() == null || req.showInMenu());
        c.setSortOrder(req.sortOrder() == null ? nextSortOrder(c.getParentId()) : req.sortOrder());
        c.setArtKind(trimToNull(req.artKind()));
        applySlug(c, req.slug());
        List<String> seo = applySeo(c, req);
        checkName(c);
        c = repository.save(c);
        repository.flush();
        CategoryRules.checkTree(repository.findAll(), productRepository::countByCategory);
        directory.evictAll();
        return new Saved(get(UuidUtil.toString(c.getId())), null, seo);
    }

    @Transactional
    public Saved update(String id, CategoryUpsertRequest req) {
        Category c = load(id);
        String previousSlug = c.getSlug();
        String oldName = c.getName();
        if (req.name() != null) {
            String name = trimToNull(req.name());
            if (name == null) {
                throw new BadRequestException("name: укажите название категории");
            }
            c.setName(name);
        }
        if (req.parentId() != null) {
            c.setParentId(req.parentId().isBlank() ? null : parentId(req.parentId()));
        }
        if (req.sortOrder() != null) {
            c.setSortOrder(req.sortOrder());
        }
        if (req.showInMenu() != null) {
            c.setShowInMenu(req.showInMenu());
        }
        if (req.artKind() != null) {
            c.setArtKind(trimToNull(req.artKind()));
        }
        if (req.slug() != null) {
            applySlug(c, req.slug());
        }
        List<String> seo = applySeo(c, req);
        checkName(c);
        repository.save(c);
        repository.flush();
        CategoryRules.checkTree(repository.findAll(), productRepository::countByCategory);
        if (!Objects.equals(oldName, c.getName())) {
            seo = new ArrayList<>(seo);
            seo.add(0, "название «" + oldName + "» → «" + c.getName() + "»");
        }
        directory.evictAll();
        return new Saved(get(id), previousSlug, seo);
    }

    @Transactional
    public Deleted delete(String id) {
        Category c = load(id);
        if (repository.findAll().stream().anyMatch(x -> Arrays.equals(x.getParentId(), c.getId()))) {
            throw new ConflictException("у категории «" + c.getName() + "» есть подкатегории — сначала удалите "
                    + "или перенесите их", CategoryRules.HAS_CHILDREN);
        }
        long products = productRepository.countByCategory(c.getId());
        if (products > 0) {
            throw new ConflictException("в категории «" + c.getName() + "» товаров: " + products
                    + " — сначала перенесите их", CategoryRules.HAS_PRODUCTS, Map.of("count", products));
        }
        Deleted deleted = new Deleted(c.getName(), c.getSlug());
        repository.delete(c);
        // content_translations has no FK — clean up by hand in the same transaction.
        translationService.deleteForEntities(TranslationEntityType.CATEGORY, List.of(c.getId()));
        directory.evictAll();
        return deleted;
    }

    /** Moves/reorders several categories at once; the tree rules are checked on the final state. */
    @Transactional
    public List<AdminCategoryDto> reorder(List<ReorderItem> items) {
        if (items == null || items.isEmpty()) {
            throw new BadRequestException("empty reorder");
        }
        for (ReorderItem it : items) {
            Category c = load(it.id());
            c.setParentId(it.parentId() == null || it.parentId().isBlank() ? null : parentId(it.parentId()));
            if (it.sortOrder() != null) {
                c.setSortOrder(it.sortOrder());
            }
            checkName(c);
            repository.save(c);
        }
        repository.flush();
        CategoryRules.checkTree(repository.findAll(), productRepository::countByCategory);
        directory.evictAll();
        return list();
    }

    // ------------------------------------------------------------------ internals

    private byte[] parentId(String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        return load(id).getId();
    }

    private int nextSortOrder(byte[] parentId) {
        return repository.findAll().stream()
                .filter(c -> Arrays.equals(c.getParentId(), parentId))
                .mapToInt(Category::getSortOrder).max().orElse(0) + 10;
    }

    /** Names are unique among siblings (case-insensitive). */
    private void checkName(Category c) {
        for (Category other : repository.findAll()) {
            if (!Arrays.equals(other.getId(), c.getId()) && Arrays.equals(other.getParentId(), c.getParentId())
                    && other.getName().equalsIgnoreCase(c.getName())) {
                throw new BadRequestException("категория «" + c.getName() + "» уже есть на этом уровне");
            }
        }
    }

    private void applySlug(Category c, String requested) {
        String explicit = requested == null ? "" : requested.trim();
        if (!explicit.isEmpty()) {
            String normalised = SlugService.slugify(explicit);
            if (normalised.isEmpty()) {
                throw new BadRequestException("slug: допустимы латиница, цифры и дефис");
            }
            if (!normalised.equals(c.getSlug()) && slugService.categorySlugTaken(normalised, c.getId())) {
                throw new BadRequestException("slug «" + normalised + "» уже занят");
            }
            c.setSlug(normalised);
        } else if (c.getSlug() == null || requested != null) {
            c.setSlug(slugService.forCategory(null, c.getName(), c.getId()));
        }
    }

    /** null = keep, blank = clear. @return labels of the SEO fields whose text changed */
    private static List<String> applySeo(Category c, CategoryUpsertRequest req) {
        List<String> changed = new ArrayList<>();
        if (req.seoTitle() != null && set(c.getSeoTitle(), trimToNull(req.seoTitle()), c::setSeoTitle)) {
            changed.add("SEO title");
        }
        if (req.seoDescription() != null
                && set(c.getSeoDescription(), trimToNull(req.seoDescription()), c::setSeoDescription)) {
            changed.add("SEO description");
        }
        if (req.h1() != null && set(c.getH1(), trimToNull(req.h1()), c::setH1)) {
            changed.add("H1");
        }
        if (req.introText() != null && set(c.getIntroText(), trimToNull(req.introText()), c::setIntroText)) {
            changed.add("SEO-текст");
        }
        return changed;
    }

    private static boolean set(String current, String next, Consumer<String> setter) {
        if (Objects.equals(current, next)) {
            return false;
        }
        setter.accept(next);
        return true;
    }

    private Category load(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BadRequestException("invalid category id: " + id);
        }
        return repository.findById(key).orElseThrow(() -> new NotFoundException("category not found"));
    }

    static Map<String, Long> counts(List<Object[]> rows) {
        Map<String, Long> out = new HashMap<>();
        for (Object[] r : rows) {
            if (r[0] != null) {
                out.put(UuidUtil.toString((byte[]) r[0]), ((Number) r[1]).longValue());
            }
        }
        return out;
    }

    static AdminCategoryDto dto(CatalogSnapshot s, Category c, Map<String, Long> active, Map<String, Long> direct) {
        String id = UuidUtil.toString(c.getId());
        long subtree = 0;
        for (String x : s.subtree(id)) {
            subtree += active.getOrDefault(x, 0L);
        }
        return new AdminCategoryDto(id, c.getSlug(), c.getName(),
                c.getParentId() == null ? null : UuidUtil.toString(c.getParentId()), c.getSortOrder(),
                c.isShowInMenu(), c.getArtKind(), subtree, direct.getOrDefault(id, 0L), s.isLeaf(id),
                c.getParentId() == null ? 0 : 1, c.getSeoTitle(), c.getSeoDescription(), c.getH1(), c.getIntroText());
    }
}
