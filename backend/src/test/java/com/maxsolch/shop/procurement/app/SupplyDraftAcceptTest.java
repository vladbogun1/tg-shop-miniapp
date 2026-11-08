package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.AdminCards;
import com.maxsolch.shop.catalog.app.AdminProductDto;
import com.maxsolch.shop.catalog.app.AdminProducts;
import com.maxsolch.shop.catalog.app.CardDraft;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.app.NewProductCards;
import com.maxsolch.shop.catalog.app.ProductUpsertRequest;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchDto;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.SupplierDto;
import com.maxsolch.shop.procurement.app.SupplierAliases.AliasesRequest;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.SupplyDraftEvents;
import com.maxsolch.shop.procurement.domain.supplyai.CatalogItem;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.LineDecision;
import com.maxsolch.shop.procurement.domain.supplyai.NewProductDraft;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import com.maxsolch.shop.procurement.domain.supplyai.SourceLine;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** «Принять»: the new product with its card, the batch with the merged lines, the supplier memory — or nothing. */
class SupplyDraftAcceptTest {

    static final String OLD = "11111111-aaaa-4000-8000-000000000001";
    static final String NEW = "99999999-aaaa-4000-8000-000000000009";

    AdminProducts products = mock(AdminProducts.class);
    AdminCards adminCards = mock(AdminCards.class);
    NewProductCards cards = mock(NewProductCards.class);
    AdminBatches batches = mock(AdminBatches.class);
    SupplierService suppliers = mock(SupplierService.class);
    SupplierAliases aliases = mock(SupplierAliases.class);
    SupplyDraftCatalog catalog = mock(SupplyDraftCatalog.class);
    DomainEvents events = mock(DomainEvents.class);
    SupplyDraftJson json = new SupplyDraftJson();
    Clock clock = Clock.fixed(Instant.parse("2026-11-08T10:00:00Z"), ZoneOffset.UTC);
    SupplyDraftAccept accept;
    SupplyDraft draft;
    DraftState s;

    @BeforeEach
    void setUp() {
        accept = new SupplyDraftAccept(products, adminCards, cards, batches, suppliers, aliases, catalog, json, events,
                clock, new ShopZone("Europe/Kyiv"));
        draft = SupplyDraft.start(42L, List.of(7L), "{}", clock.instant());
        ReflectionTestUtils.setField(draft, "id", 5L);
        s = new DraftState();
        s.setTitle("Zpmax · 123");
        s.setCurrency("CNY");
        s.setFxRate(new BigDecimal("6"));
        s.setSupplierName("Zpmax");
        s.setEtaWeeks(2);
        s.setRows(List.of(
                new ReviewRow(line("L1", 2, 100.0), LineDecision.match(OLD, null, "auto"), List.of()),
                new ReviewRow(line("L2", 3, 10.0), LineDecision.fresh(new NewProductDraft("Коврик Zpmax ZP9", "Zpmax", "c1", null, null)), List.of()),
                new ReviewRow(line("L3", 1, 20.0), LineDecision.match(OLD, null, "ai"), List.of())));
        s.getPrices().put("L2", 120L);
        s.getCards().put("L2", json.tree(new CardDraft("kovriki", "c1", "Zpmax", Map.of(), Map.of(), 80,
                Map.of("ru", "Коврик Zpmax ZP9"), Map.of("ru", "Описание"), Map.of(), List.of(),
                List.of("https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg", "https://a/4.jpg"), Map.of(), null)));
        when(catalog.items()).thenReturn(List.of(new CatalogItem(OLD, "Коврик Zpmax ZP1", "Zpmax", "c1", List.of(), null)));
        when(catalog.isLeaf("c1")).thenReturn(true);
        when(suppliers.suppliers()).thenReturn(List.of(new SupplierDto(9L, "zpmax", null)));
        AdminProductDto created = mock(AdminProductDto.class);
        when(created.id()).thenReturn(NEW);
        when(products.create(any())).thenReturn(created);
        when(cards.toImportItem(eq(NEW), any(), eq(true))).thenReturn(mock(CardImportItem.class));
        BatchDto batch = mock(BatchDto.class);
        when(batch.id()).thenReturn(77L);
        when(batches.create(any(), anyBoolean())).thenReturn(batch);
    }

    @Test
    void createsEverythingInOneGo() {
        assertThat(accept.accept(draft, s, true).batchId()).isEqualTo(77L);

        ArgumentCaptor<ProductUpsertRequest> product = ArgumentCaptor.forClass(ProductUpsertRequest.class);
        verify(products).create(product.capture());
        assertThat(product.getValue().priceMinor()).isEqualTo(12_000L);
        assertThat(product.getValue().active()).isFalse();
        assertThat(product.getValue().stock()).isZero();
        assertThat(product.getValue().categoryId()).isEqualTo("c1");
        verify(adminCards).importCards(any(CardsImportRequest.class));

        ArgumentCaptor<BatchRequest> batch = ArgumentCaptor.forClass(BatchRequest.class);
        verify(batches).create(batch.capture(), eq(true));
        assertThat(batch.getValue().supplierId()).isEqualTo(9L);                 // found by name, not created again
        assertThat(batch.getValue().etaTo()).isEqualTo(LocalDate.of(2026, 11, 22));
        assertThat(batch.getValue().items()).hasSize(2);
        assertThat(batch.getValue().items().get(0).qtyOrdered()).isEqualTo(3);  // L1 + L3, the same product
        assertThat(batch.getValue().items().get(0).unitPriceFx()).isEqualTo(7_333L);
        assertThat(batch.getValue().items().get(1).productId()).isEqualTo(NEW);
        verify(suppliers, never()).createSupplier(any());
        verify(aliases).save(eq(9L), any(AliasesRequest.class));
        assertThat(draft.getStatus()).isEqualTo(SupplyDraft.Status.ACCEPTED);
        verify(events).publish(new SupplyDraftEvents.Accepted(5L, 77L,
                Map.of(NEW, List.of("https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg"))));
    }

    @Test
    void aTitleAlreadyInTheCatalogStopsBeforeAnythingIsCreated() {
        when(catalog.items()).thenReturn(List.of(new CatalogItem(OLD, "коврик zpmax zp9", "Zpmax", "c1", List.of(), null)));

        assertThatThrownBy(() -> accept.accept(draft, s, true)).isInstanceOf(DomainException.BadRequest.class);
        verifyNoInteractions(products, batches, aliases);
    }

    @Test
    void aMatchedProductWithVariantsNeedsTheVariant() {
        when(catalog.items()).thenReturn(List.of(new CatalogItem(OLD, "Коврик Zpmax ZP1", "Zpmax", "c1",
                List.of(new CatalogItem.Variant("v1", "Black")), null)));

        assertThatThrownBy(() -> accept.accept(draft, s, true)).isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("L1: выберите вариант товара");
        verifyNoInteractions(products, batches);
    }

    @Test
    void anOpenLineOrAMissingPriceStopsToo() {
        s.getPrices().clear();

        assertThatThrownBy(() -> accept.accept(draft, s, true)).isInstanceOf(DomainException.BadRequest.class);
        verifyNoInteractions(products, batches);
    }

    private static SourceLine line(String id, int qty, double price) {
        return new SourceLine(id, id + " text", null, null, null, null, null, qty, price, null, null);
    }
}
