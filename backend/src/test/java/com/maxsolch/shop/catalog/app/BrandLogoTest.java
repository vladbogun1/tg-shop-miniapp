package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.Brand;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminBrandDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.BrandUpsertRequest;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/** Brand logos (V54): key/URL rules, mode, cleanup of the replaced object, merge keeps a logo. */
class BrandLogoTest {

    static final String KEY = ImageStorageService.BRAND_LOGO_PREFIX + "0f/logo.svg";

    InMemoryCatalog db;
    ImageStorageService storage;
    BrandAdminService service;

    @BeforeEach
    void setUp() {
        db = new InMemoryCatalog();
        storage = mock(ImageStorageService.class);
        service = new BrandAdminService(db.brandRepository, db.productRepository, db.directory, storage,
                db.events(storage));
    }

    private static BrandUpsertRequest req(String name, String logoUrl, String logoMode) {
        return new BrandUpsertRequest(name, null, null, null, null, logoUrl, logoMode);
    }

    @Test
    void newBrandHasNoLogoAndMonoMode() {
        AdminBrandDto b = service.create(req("Lamzu", null, null));
        assertThat(b.logoUrl()).isNull();
        assertThat(b.logoMode()).isEqualTo("MONO");
    }

    @Test
    void storesUploadedKeyAndModeAndShowsThemInTheSnapshot() {
        AdminBrandDto b = service.create(req("Lamzu", "/" + KEY, "original"));
        assertThat(b.logoUrl()).isEqualTo(KEY);
        assertThat(b.logoMode()).isEqualTo("ORIGINAL");
        CatalogSnapshot.BrandInfo info = db.directory.load().brands().get(0);
        assertThat(info.logoUrl()).isEqualTo(KEY);
        assertThat(info.logoMode()).isEqualTo("ORIGINAL");
    }

    @Test
    void acceptsAnHttpsUrl() {
        AdminBrandDto b = service.create(req("Lamzu", "https://cdn.example.com/lamzu.svg", null));
        assertThat(b.logoUrl()).isEqualTo("https://cdn.example.com/lamzu.svg");
    }

    @Test
    void refusesKeysOutsideTheLogoPrefix() {
        // A customer's private chat file must not become a public brand logo.
        assertThatThrownBy(() -> service.create(req("Lamzu", "chat/u1/x/passport.jpg", null)))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> service.create(req("Lamzu", ImageStorageService.BRAND_LOGO_PREFIX + "../chat/x",
                null))).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> service.create(req("Lamzu", "http://cdn.example.com/a.png", null)))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void refusesAnUnknownMode() {
        assertThatThrownBy(() -> service.create(req("Lamzu", null, "RAINBOW")))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void replacingOrClearingDeletesTheOldObjectButNullKeepsIt() {
        AdminBrandDto b = service.create(req("Lamzu", KEY, null));
        service.update(b.id(), req(null, null, "ORIGINAL"));
        verify(storage, never()).deleteQuietly(KEY);
        assertThat(db.brands.get(0).getLogoUrl()).isEqualTo(KEY);

        String next = ImageStorageService.BRAND_LOGO_PREFIX + "1a/logo.png";
        service.update(b.id(), req(null, next, null));
        verify(storage).deleteQuietly(KEY);

        AdminBrandDto cleared = service.update(b.id(), req(null, "", null));
        assertThat(cleared.logoUrl()).isNull();
        verify(storage).deleteQuietly(next);
    }

    @Test
    void mergeHandsTheLogoToATargetWithout() {
        AdminBrandDto source = service.create(req("ATK Gear", KEY, "ORIGINAL"));
        AdminBrandDto target = service.create(req("ATK", null, null));
        AdminBrandDto merged = service.merge(source.id(), target.id());
        assertThat(merged.logoUrl()).isEqualTo(KEY);
        assertThat(merged.logoMode()).isEqualTo("ORIGINAL");
        verify(storage, never()).deleteQuietly(KEY);
    }
}
