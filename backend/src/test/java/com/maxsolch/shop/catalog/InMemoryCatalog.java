package com.maxsolch.shop.catalog;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.translation.ContentTranslation;
import com.maxsolch.shop.translation.ContentTranslationId;
import com.maxsolch.shop.translation.ContentTranslationRepository;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

/**
 * Catalog repositories backed by plain lists (Mockito answers), so the services run their real
 * logic — tree rules, upserts, product moves — without a database.
 */
final class InMemoryCatalog {

    final List<Category> categories = new ArrayList<>();
    final List<Brand> brands = new ArrayList<>();
    final List<SpecGroup> groups = new ArrayList<>();
    final List<SpecAttribute> attributes = new ArrayList<>();
    final List<SpecOption> options = new ArrayList<>();
    final List<Product> products = new ArrayList<>();
    final List<ContentTranslation> translations = new ArrayList<>();

    final CategoryRepository categoryRepository = mock(CategoryRepository.class);
    final BrandRepository brandRepository = mock(BrandRepository.class);
    final SpecGroupRepository groupRepository = mock(SpecGroupRepository.class);
    final SpecAttributeRepository attributeRepository = mock(SpecAttributeRepository.class);
    final SpecOptionRepository optionRepository = mock(SpecOptionRepository.class);
    final ProductRepository productRepository = mock(ProductRepository.class);
    final ContentTranslationRepository translationRepository = mock(ContentTranslationRepository.class);
    final CatalogDirectory directory;

    InMemoryCatalog() {
        lenient().when(categoryRepository.findAll()).thenAnswer(i -> new ArrayList<>(categories));
        lenient().when(categoryRepository.save(any())).thenAnswer(i -> save(categories, i.getArgument(0)));
        lenient().when(categoryRepository.findById(any())).thenAnswer(i -> categories.stream()
                .filter(c -> Arrays.equals(c.getId(), (byte[]) i.getArgument(0))).findFirst());
        lenient().when(categoryRepository.existsBySlug(anyString())).thenAnswer(i -> categories.stream()
                .anyMatch(c -> c.getSlug().equals(i.getArgument(0))));
        lenient().doAnswer(i -> categories.remove(i.<Category>getArgument(0))).when(categoryRepository).delete(any());

        lenient().when(brandRepository.findAll()).thenAnswer(i -> new ArrayList<>(brands));
        lenient().when(brandRepository.save(any())).thenAnswer(i -> save(brands, i.getArgument(0)));
        lenient().when(brandRepository.existsBySlug(anyString())).thenAnswer(i -> brands.stream()
                .anyMatch(b -> b.getSlug().equals(i.getArgument(0))));

        lenient().when(groupRepository.findAll()).thenAnswer(i -> new ArrayList<>(groups));
        lenient().when(groupRepository.findById(anyString())).thenAnswer(i -> groups.stream()
                .filter(g -> g.getKey().equals(i.getArgument(0))).findFirst());
        lenient().when(groupRepository.save(any())).thenAnswer(i -> {
            SpecGroup g = i.getArgument(0);
            if (!groups.contains(g)) {
                groups.add(g);
            }
            return g;
        });

        lenient().when(attributeRepository.findAll()).thenAnswer(i -> new ArrayList<>(attributes));
        lenient().when(attributeRepository.save(any())).thenAnswer(i -> save(attributes, i.getArgument(0)));
        lenient().when(optionRepository.findAll()).thenAnswer(i -> new ArrayList<>(options));
        lenient().when(optionRepository.save(any())).thenAnswer(i -> save(options, i.getArgument(0)));
        lenient().when(optionRepository.findByAttribute(any())).thenAnswer(i -> options.stream()
                .filter(o -> Arrays.equals(o.getAttributeId(), (byte[]) i.getArgument(0))).toList());

        lenient().when(productRepository.countByCategory(any())).thenAnswer(i -> products.stream()
                .filter(p -> Arrays.equals(p.getCategoryId(), (byte[]) i.getArgument(0))).count());
        lenient().when(productRepository.moveCategory(any(), any())).thenAnswer(i -> {
            int n = 0;
            for (Product p : products) {
                if (Arrays.equals(p.getCategoryId(), (byte[]) i.getArgument(0))) {
                    p.setCategoryId(i.getArgument(1));
                    n++;
                }
            }
            return n;
        });
        lenient().when(productRepository.countsByCategory(org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(List.of());
        lenient().when(productRepository.findAllNotArchived()).thenAnswer(i -> products.stream()
                .filter(p -> !p.isArchived()).toList());
        lenient().when(productRepository.findByIdForUpdate(any())).thenAnswer(i -> products.stream()
                .filter(p -> Arrays.equals(p.getId(), (byte[]) i.getArgument(0))).findFirst());
        lenient().when(productRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        lenient().when(translationRepository.findById(any())).thenAnswer(i -> {
            ContentTranslationId id = i.getArgument(0);
            return translations.stream().filter(t -> t.getId().equals(id)).findFirst();
        });
        lenient().when(translationRepository.save(any())).thenAnswer(i -> save(translations, i.getArgument(0)));

        directory = new CatalogDirectory(categoryRepository, brandRepository, groupRepository, attributeRepository,
                optionRepository, new ConcurrentMapCacheManager("catalogSchema", "products", "productById"));
    }

    private static <T> T save(List<T> list, T item) {
        // @PrePersist does not run without JPA: assign ids here.
        if (item instanceof Category c && c.getId() == null) {
            c.setId(UuidUtil.randomBytes());
        } else if (item instanceof Brand b && b.getId() == null) {
            b.setId(UuidUtil.randomBytes());
        } else if (item instanceof SpecAttribute a && a.getId() == null) {
            a.setId(UuidUtil.randomBytes());
        } else if (item instanceof SpecOption o && o.getId() == null) {
            o.setId(UuidUtil.randomBytes());
        }
        if (!list.contains(item)) {
            list.add(item);
        }
        return item;
    }

    Category category(String slug, String name, Category parent) {
        Category c = new Category();
        c.setId(UuidUtil.randomBytes());
        c.setSlug(slug);
        c.setName(name);
        c.setParentId(parent == null ? null : parent.getId());
        categories.add(c);
        return c;
    }

    Product product(String title, Category category) {
        Product p = new Product();
        p.setId(UuidUtil.randomBytes());
        p.setTitle(title);
        p.setSlug(title.toLowerCase().replace(' ', '-'));
        p.setPriceMinor(100_00);
        p.setCategoryId(category == null ? null : category.getId());
        products.add(p);
        return p;
    }

    Optional<Category> bySlug(String slug) {
        return categories.stream().filter(c -> c.getSlug().equals(slug)).findFirst();
    }
}
