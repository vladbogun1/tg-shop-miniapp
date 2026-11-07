package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.app.BrandAdminService;
import com.maxsolch.shop.catalog.app.BrandSlugHistory;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminBrandDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.BrandUpsertRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V85 on the real schema: a renamed brand slug answers through the public endpoint the site's 301 asks,
 * a merge carries the absorbed slugs to the target, deleting a brand drops its old slugs (FK cascade),
 * and a slug a live brand wears again is no redirect.
 */
@AutoConfigureMockMvc
class BrandSlugRedirectIT extends AbstractMysqlIT {

    @Autowired
    BrandAdminService brands;
    @Autowired
    BrandSlugHistory history;
    @Autowired
    MockMvc mvc;

    private static String uniq(String base) {
        return base + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private AdminBrandDto brand(String slug) {
        return brands.create(new BrandUpsertRequest(uniq("Brand"), slug, null, null, null, null, null));
    }

    private AdminBrandDto rename(AdminBrandDto b, String slug) {
        return brands.update(b.id(), new BrandUpsertRequest(null, slug, null, null, null, null, null));
    }

    @Test
    void renamedSlugRedirectsToTheNewOneOverHttp() throws Exception {
        String old = uniq("old");
        String now = uniq("new");
        AdminBrandDto b = brand(old);
        rename(b, now);
        mvc.perform(get("/api/public/brands/redirects").param("slugs", old + ",unknown-" + old))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$.['" + old + "']").value(now));
    }

    @Test
    void chainsPointAtTheCurrentSlugAndRenamingBackClearsTheRedirect() {
        String a = uniq("a");
        String b2 = uniq("b");
        String c = uniq("c");
        AdminBrandDto b = brand(a);
        rename(b, b2);
        rename(b, c);
        assertThat(history.resolve(List.of(a, b2))).containsEntry(a, c).containsEntry(b2, c);
        rename(b, a);
        assertThat(history.resolve(List.of(a, b2, c))).doesNotContainKey(a).containsEntry(b2, a).containsEntry(c, a);
    }

    @Test
    void aSlugTakenByAnotherLiveBrandIsNoRedirect() {
        String old = uniq("old");
        AdminBrandDto first = brand(old);
        rename(first, uniq("moved"));
        brand(old); // the freed slug goes to a new brand
        assertThat(history.resolve(List.of(old))).isEmpty();
    }

    @Test
    void mergeCarriesTheAbsorbedSlugsToTheTarget() {
        String sourceOld = uniq("src-old");
        String source = uniq("src");
        String target = uniq("tgt");
        AdminBrandDto s = brand(sourceOld);
        rename(s, source);
        AdminBrandDto t = brand(target);
        brands.merge(s.id(), t.id());
        Map<String, String> got = history.resolve(List.of(sourceOld, source));
        assertThat(got).containsEntry(sourceOld, target).containsEntry(source, target);
    }

    @Test
    void deletingTheBrandDropsItsOldSlugs() {
        String old = uniq("old");
        AdminBrandDto b = brand(old);
        rename(b, uniq("new"));
        brands.delete(b.id());
        assertThat(history.resolve(List.of(old))).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM brand_slug_redirects WHERE old_slug = ?", Integer.class, old))
                .isZero();
    }
}
