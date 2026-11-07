package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.app.CatalogDtos.AdminBrandDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.BrandUpsertRequest;
import com.maxsolch.shop.catalog.domain.BrandSlugRedirect;
import com.maxsolch.shop.catalog.infra.BrandSlugRedirectRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/** Old brand slugs (V85): the admin's slug change and merge feed the history; the history keeps its rules. */
class BrandSlugRedirectTest {

    InMemoryCatalog db;
    BrandSlugHistory history;
    BrandAdminService service;

    @BeforeEach
    void setUp() {
        db = new InMemoryCatalog();
        history = mock(BrandSlugHistory.class);
        service = new BrandAdminService(db.brandRepository, db.productRepository, db.directory,
                db.events(null), history);
    }

    private static BrandUpsertRequest slug(String slug) {
        return new BrandUpsertRequest(null, slug, null, null, null, null, null);
    }

    @Test
    void aChangedSlugIsHandedToTheHistoryWithTheOldOne() {
        AdminBrandDto b = service.create(new BrandUpsertRequest("Lamzu", "lamzu", null, null, null, null, null));
        service.update(b.id(), slug("lamzu-gaming"));
        verify(history).slugChanged(eq(UuidUtil.toBytes(b.id())), eq("lamzu"), eq("lamzu-gaming"));
    }

    @Test
    void mergeSendsTheAbsorbedSlugToTheTarget() {
        AdminBrandDto source = service.create(new BrandUpsertRequest("ATK", "atk", null, null, null, null, null));
        AdminBrandDto target = service.create(new BrandUpsertRequest("ATTACK SHARK", "attack-shark", null, null, null, null, null));
        service.merge(source.id(), target.id());
        verify(history).merged(eq(UuidUtil.toBytes(source.id())), eq("atk"), eq(UuidUtil.toBytes(target.id())), eq("attack-shark"));
    }

    // ------------------------------------------------------------------ the history itself

    private final List<BrandSlugRedirect> rows = new ArrayList<>();

    private BrandSlugHistory realHistory() {
        BrandSlugRedirectRepository repo = mock(BrandSlugRedirectRepository.class);
        org.mockito.Mockito.doAnswer(i -> rows.removeIf(r -> r.getOldSlug().equals(i.getArgument(0))))
                .when(repo).deleteById(any(String.class));
        org.mockito.Mockito.when(repo.save(any())).thenAnswer(i -> {
            BrandSlugRedirect r = i.getArgument(0);
            rows.removeIf(x -> x.getOldSlug().equals(r.getOldSlug()));
            rows.add(r);
            return r;
        });
        org.mockito.Mockito.when(repo.repoint(any(), any())).thenAnswer(i -> {
            List<BrandSlugRedirect> moved = rows.stream().filter(r -> Arrays.equals(r.getBrandId(), i.getArgument(0))).toList();
            rows.removeAll(moved);
            moved.forEach(r -> rows.add(new BrandSlugRedirect(r.getOldSlug(), i.getArgument(1))));
            return moved.size();
        });
        return new BrandSlugHistory(repo);
    }

    @Test
    void theOldSlugIsStoredAndTheNewOneStopsBeingARedirect() {
        BrandSlugHistory h = realHistory();
        byte[] id = UuidUtil.randomBytes();
        h.slugChanged(id, "lamzu", "lamzu-gaming");
        assertThat(rows).extracting(BrandSlugRedirect::getOldSlug).containsExactly("lamzu");
        h.slugChanged(id, "lamzu-gaming", "lamzu"); // renamed back
        assertThat(rows).extracting(BrandSlugRedirect::getOldSlug).containsExactly("lamzu-gaming");
    }

    @Test
    void sameSlugRecordsNothing() {
        BrandSlugHistory h = realHistory();
        h.slugChanged(UuidUtil.randomBytes(), "lamzu", "lamzu");
        h.slugChanged(UuidUtil.randomBytes(), null, "lamzu");
        assertThat(rows).isEmpty();
    }

    @Test
    void mergeKeepsEarlierRedirectsAndAddsTheAbsorbedSlug() {
        BrandSlugHistory h = realHistory();
        byte[] source = UuidUtil.randomBytes();
        byte[] target = UuidUtil.randomBytes();
        h.slugChanged(source, "atk-old", "atk");
        h.merged(source, "atk", target, "attack-shark");
        assertThat(rows).extracting(BrandSlugRedirect::getOldSlug).containsExactlyInAnyOrder("atk-old", "atk");
        assertThat(rows).allSatisfy(r -> assertThat(r.getBrandId()).isEqualTo(target));
    }

    @Test
    void resolveWithNoUsableSlugsDoesNotTouchTheDatabase() {
        BrandSlugRedirectRepository repo = mock(BrandSlugRedirectRepository.class);
        BrandSlugHistory h = new BrandSlugHistory(repo);
        assertThat(h.resolve(Arrays.asList(null, " ", ""))).isEmpty();
        verify(repo, never()).resolve(any());
    }
}
