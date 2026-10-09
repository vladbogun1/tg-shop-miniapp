package com.maxsolch.shop.catalog;

import com.maxsolch.shop.catalog.CatalogDtos.AdminBrandDto;
import com.maxsolch.shop.catalog.CatalogDtos.BrandUpsertRequest;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.service.SlugService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import static com.maxsolch.shop.common.Texts.trimToNull;

/** Brand directory (§3.2): CRUD, merge, and "find by name/alias or create" for products and imports. */
@Service
public class BrandAdminService {

    private final BrandRepository repository;
    private final ProductRepository productRepository;
    private final CatalogDirectory directory;
    private final ImageStorageService storage;

    public BrandAdminService(BrandRepository repository, ProductRepository productRepository,
                             CatalogDirectory directory, ImageStorageService storage) {
        this.repository = repository;
        this.productRepository = productRepository;
        this.directory = directory;
        this.storage = storage;
    }

    @Transactional(readOnly = true)
    public List<AdminBrandDto> list() {
        Map<String, Long> counts = CategoryAdminService.counts(productRepository.countsByBrand());
        return repository.findAll().stream()
                .sorted(Comparator.comparingInt(Brand::getSortOrder)
                        .thenComparing(b -> b.getName().toLowerCase(Locale.ROOT)))
                .map(b -> dto(b, counts))
                .toList();
    }

    @Transactional
    public AdminBrandDto create(BrandUpsertRequest req) {
        String name = trimToNull(req.name());
        if (name == null) {
            throw new BadRequestException("name: укажите бренд");
        }
        if (findByNameOrAlias(name).isPresent()) {
            throw new BadRequestException("бренд «" + name + "» уже есть (или это алиас другого бренда)");
        }
        Brand b = new Brand();
        b.setName(name);
        apply(b, req);
        b = repository.save(b);
        directory.evictAll();
        return dto(b, Map.of());
    }

    @Transactional
    public AdminBrandDto update(String id, BrandUpsertRequest req) {
        Brand b = load(id);
        String name = trimToNull(req.name());
        if (name != null && !name.equals(b.getName())) {
            Optional<Brand> clash = repository.findByName(name);
            if (clash.isPresent() && !Arrays.equals(clash.get().getId(), b.getId())) {
                throw new BadRequestException("бренд «" + name + "» уже есть");
            }
            b.setName(name);
        }
        String oldLogo = b.getLogoUrl();
        apply(b, req);
        repository.save(b);
        if (oldLogo != null && !oldLogo.equals(b.getLogoUrl())) {
            storage.deleteQuietly(oldLogo);
        }
        directory.evictAll();
        return dto(b, CategoryAdminService.counts(productRepository.countsByBrand()));
    }

    /** Products of the brand keep existing with no brand (FK ON DELETE SET NULL; done explicitly here). */
    @Transactional
    public String delete(String id) {
        Brand b = load(id);
        productRepository.moveBrand(b.getId(), null);
        repository.delete(b);
        storage.deleteQuietly(b.getLogoUrl());
        directory.evictAll();
        return b.getName();
    }

    /** Moves the products to {@code targetId}, keeps the name and aliases as the target's aliases. */
    @Transactional
    public AdminBrandDto merge(String id, String targetId) {
        Brand source = load(id);
        Brand target = load(targetId);
        if (Arrays.equals(source.getId(), target.getId())) {
            throw new BadRequestException("нельзя объединить бренд с самим собой");
        }
        productRepository.moveBrand(source.getId(), target.getId());
        List<String> aliases = new ArrayList<>(target.aliasList());
        aliases.add(source.getName());
        aliases.addAll(source.aliasList());
        aliases.removeIf(a -> a.equalsIgnoreCase(target.getName()));
        if (target.getLogoUrl() == null && source.getLogoUrl() != null) {
            // The target inherits the logo instead of losing it with the source.
            target.setLogoUrl(source.getLogoUrl());
            target.setLogoMode(source.getLogoMode());
        } else {
            storage.deleteQuietly(source.getLogoUrl());
        }
        repository.delete(source);
        repository.flush();
        target.setAliasList(aliases);
        repository.save(target);
        directory.evictAll();
        return dto(target, CategoryAdminService.counts(productRepository.countsByBrand()));
    }

    /** Case-insensitive match on the name, then on any alias. */
    @Transactional(readOnly = true)
    public Optional<Brand> findByNameOrAlias(String text) {
        String n = norm(text);
        if (n.isEmpty()) {
            return Optional.empty();
        }
        List<Brand> all = repository.findAll();
        for (Brand b : all) {
            if (norm(b.getName()).equals(n) || norm(b.getSlug()).equals(n)) {
                return Optional.of(b);
            }
        }
        for (Brand b : all) {
            for (String a : b.aliasList()) {
                if (norm(a).equals(n)) {
                    return Optional.of(b);
                }
            }
        }
        return Optional.empty();
    }

    /** Existing brand by name/alias, or a new one. {@code created} tells the caller which. */
    @Transactional
    public Brand findOrCreate(String name, boolean[] created) {
        String clean = trimToNull(name);
        if (clean == null) {
            return null;
        }
        Optional<Brand> found = findByNameOrAlias(clean);
        if (found.isPresent()) {
            return found.get();
        }
        Brand b = new Brand();
        b.setName(clean.length() > 128 ? clean.substring(0, 128) : clean);
        b.setSlug(slugService(b.getName(), null));
        b = repository.save(b);
        if (created != null && created.length > 0) {
            created[0] = true;
        }
        directory.evictAll();
        return b;
    }

    private void apply(Brand b, BrandUpsertRequest req) {
        if (req.slug() != null || b.getSlug() == null) {
            String explicit = req.slug() == null ? "" : SlugService.slugify(req.slug());
            if (!explicit.isEmpty()) {
                boolean taken = b.getId() == null ? repository.existsBySlug(explicit)
                        : repository.existsBySlugAndIdNot(explicit, b.getId());
                if (taken) {
                    throw new BadRequestException("slug «" + explicit + "» уже занят");
                }
                b.setSlug(explicit);
            } else {
                b.setSlug(slugService(b.getName(), b.getId()));
            }
        }
        if (req.aliases() != null) {
            b.setAliasList(req.aliases().stream().filter(a -> a != null && !a.trim().equalsIgnoreCase(b.getName()))
                    .toList());
        }
        if (req.website() != null) {
            b.setWebsite(trimToNull(req.website()));
        }
        if (req.sortOrder() != null) {
            b.setSortOrder(req.sortOrder());
        }
        if (req.logoUrl() != null) {
            b.setLogoUrl(logoUrl(req.logoUrl()));
        }
        if (req.logoMode() != null) {
            b.setLogoMode(logoMode(req.logoMode()));
        }
    }

    /**
     * Blank = no logo. Otherwise either a key under {@link ImageStorageService#BRAND_LOGO_PREFIX} (from
     * the logo upload — only that prefix, so a brand cannot point the site at a customer's chat file)
     * or an absolute https URL.
     */
    static String logoUrl(String raw) {
        String v = trimToNull(raw);
        if (v == null) {
            return null;
        }
        if (v.startsWith("https://")) {
            return v;
        }
        String key = v.replaceFirst("^/+", "");
        if (!key.startsWith(ImageStorageService.BRAND_LOGO_PREFIX) || key.contains("..")) {
            throw new BadRequestException("logoUrl: загрузите логотип заново");
        }
        return key;
    }

    static String logoMode(String raw) {
        String v = raw.trim().toUpperCase(Locale.ROOT);
        if (!v.equals(Brand.LOGO_MONO) && !v.equals(Brand.LOGO_ORIGINAL)) {
            throw new BadRequestException("logoMode: MONO или ORIGINAL");
        }
        return v;
    }

    private String slugService(String name, byte[] selfId) {
        String base = SlugService.slugify(name);
        return SlugService.uniquify(base.isEmpty() ? "brand" : base,
                s -> selfId == null ? repository.existsBySlug(s) : repository.existsBySlugAndIdNot(s, selfId));
    }

    private Brand load(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BadRequestException("invalid brand id: " + id);
        }
        return repository.findById(key).orElseThrow(() -> new NotFoundException("brand not found"));
    }

    static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("[\\s_-]+", " ");
    }

    static AdminBrandDto dto(Brand b, Map<String, Long> counts) {
        String id = UuidUtil.toString(b.getId());
        return new AdminBrandDto(id, b.getName(), b.getSlug(), b.aliasList(), b.getWebsite(), b.getSortOrder(),
                counts.getOrDefault(id, 0L), b.getLogoUrl(), b.getLogoMode());
    }
}
