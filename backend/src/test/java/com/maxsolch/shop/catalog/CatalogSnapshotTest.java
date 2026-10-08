package com.maxsolch.shop.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static com.maxsolch.shop.catalog.CatalogFixtures.KEYBOARDS;
import static com.maxsolch.shop.catalog.CatalogFixtures.MAGNETIC;
import static com.maxsolch.shop.catalog.CatalogFixtures.MECHANICAL;
import static com.maxsolch.shop.catalog.CatalogFixtures.MICE;
import static org.assertj.core.api.Assertions.assertThat;

/** Tree helpers, attribute inheritance, required checks and the bucket ids. */
class CatalogSnapshotTest {

    private final CatalogSnapshot s = CatalogFixtures.snapshot();

    @Test
    void pathSubtreeAndLeaves() {
        assertThat(s.path(MAGNETIC)).extracting(CatalogSnapshot.Cat::slug).containsExactly("klaviatury", "klv-magnitnye");
        assertThat(s.subtree(KEYBOARDS)).containsExactlyInAnyOrder(KEYBOARDS, MAGNETIC, MECHANICAL);
        assertThat(s.isLeaf(KEYBOARDS)).isFalse();
        assertThat(s.isLeaf(MICE)).isTrue();
        assertThat(s.root(MAGNETIC).slug()).isEqualTo("klaviatury");
        assertThat(s.treeOrder()).extracting(CatalogSnapshot.Cat::slug)
                .containsExactly("myshki", "klaviatury", "klv-magnitnye", "klv-mekhanicheskie");
        assertThat(s.path("unknown")).isEmpty();
        assertThat(s.categoryBySlug(" KLAVIATURY ")).isNotNull();
    }

    @Test
    void attributesAreGlobalThenRootThenLeaf() {
        assertThat(s.attributesFor(MAGNETIC)).extracting(CatalogSnapshot.Attr::key)
                .containsExactly("color", "hot_swap", "actuation_mm");
        assertThat(s.attributesFor(MECHANICAL)).extracting(CatalogSnapshot.Attr::key).containsExactly("color", "hot_swap");
        assertThat(s.attributesFor(null)).extracting(CatalogSnapshot.Attr::key).containsExactly("color");
    }

    @Test
    void missingRequiredFollowsThePath() {
        assertThat(s.missingRequired(MAGNETIC, Map.of("hot_swap", false))).containsExactly("actuation_mm");
        assertThat(s.missingRequired(MICE, Map.of())).containsExactlyInAnyOrder("weight_g", "sensor");
    }

    @Test
    void bucketIdsAreDerivedFromTheBounds() {
        assertThat(CatalogSnapshot.bucketId(null, 44.9)).isEqualTo("lt45");
        assertThat(CatalogSnapshot.bucketId(65.0, null)).isEqualTo("gte65");
        assertThat(CatalogSnapshot.bucketId(45.0, 54.9)).isEqualTo("45-54_9");
        assertThat(CatalogSnapshot.bucketId(1000.0, 2000.0)).isEqualTo("1000-2000");
        assertThat(CatalogSnapshot.bucketId(0.5, null)).isEqualTo("gte0_5");
    }

    @Test
    void importedFacetBucketsBecomeStoredBucketsWithIds() throws Exception {
        var facet = new ObjectMapper().readTree("""
                {"style":"buckets","buckets":[
                  {"label_ru":"до 45 г","label_uk":"до 45 г","label_en":"under 45 g","min":null,"max":44.9},
                  {"label_ru":"45–54 г","min":45,"max":54.9},
                  {"label_ru":"дубль","min":45,"max":54.9}]}""");
        var buckets = CatalogDirectory.buckets(CatalogSchemaImporter.bucketsJson(facet));
        assertThat(buckets).extracting(CatalogSnapshot.Bucket::id).containsExactly("lt45", "45-54_9");
        assertThat(buckets.get(1).label("en")).isEqualTo("45–54 г"); // falls back to ru
        assertThat(CatalogSchemaImporter.bucketsJson(new ObjectMapper().readTree("{\"style\":\"values\",\"values\":[1000]}")))
                .isNull();
    }
}
