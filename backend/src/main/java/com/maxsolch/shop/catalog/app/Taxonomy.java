package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.Brand;
import com.maxsolch.shop.catalog.domain.Category;
import com.maxsolch.shop.catalog.infra.BrandRepository;
import com.maxsolch.shop.catalog.infra.CategoryRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/** Categories and brands for the other modules: plain lookups, no editing (that is the admin's catalog scenarios). */
@Service
public class Taxonomy {

    private final CategoryRepository categories;
    private final BrandRepository brands;

    public Taxonomy(CategoryRepository categories, BrandRepository brands) {
        this.categories = categories;
        this.brands = brands;
    }

    public List<Category> allCategories() {
        return categories.findAll();
    }

    public Optional<Brand> brandBySlug(String slug) {
        return brands.findBySlug(slug);
    }
}
