package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.procurement.app.SupplierAliases.AliasDto;
import com.maxsolch.shop.procurement.app.SupplierAliases.AliasesRequest;
import com.maxsolch.shop.procurement.domain.SupplierAlias;
import com.maxsolch.shop.procurement.infra.SupplierAliasRepository;
import com.maxsolch.shop.procurement.infra.SupplierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Supplier memory: the last confirmed match of a line wins, bad input is a 400. */
class SupplierAliasesTest {

    SupplierAliasRepository repo = mock(SupplierAliasRepository.class);
    SupplierRepository suppliers = mock(SupplierRepository.class);
    Products products = mock(Products.class);
    SupplierAliases aliases;
    String productId = UUID.randomUUID().toString();

    @BeforeEach
    void setUp() {
        aliases = new SupplierAliases(repo, suppliers, products);
        when(suppliers.existsById(7L)).thenReturn(true);
        Product p = new Product();
        ReflectionTestUtils.setField(p, "id", UuidUtil.toBytes(productId));
        p.retitle("Коврик Zpmax ZP1");
        when(products.findById(any())).thenReturn(Optional.of(p));
    }

    @Test
    void anExistingLineIsOverwrittenNotDuplicated() {
        SupplierAlias old = new SupplierAlias();
        old.setSupplierId(7L);
        old.setSourceKey("zp1 黑色");
        old.setProductId(UuidUtil.randomBytes());
        when(repo.findAllBySupplierIdAndSourceKeyIn(eq(7L), anyCollection())).thenReturn(List.of(old));

        aliases.save(7L, new AliasesRequest(List.of(new AliasDto(" zp1 黑色 ", productId, null))));

        verify(repo, times(1)).save(old);
        assertThat(UuidUtil.toString(old.getProductId())).isEqualTo(productId);
    }

    @Test
    void theSameLineTwiceKeepsTheLastAnswer() {
        String other = UUID.randomUUID().toString();
        aliases.save(7L, new AliasesRequest(List.of(new AliasDto("zp3", other, null), new AliasDto("zp3", productId, null))));

        ArgumentCaptor<SupplierAlias> saved = ArgumentCaptor.forClass(SupplierAlias.class);
        verify(repo, times(1)).save(saved.capture());
        assertThat(saved.getValue().getSourceKey()).isEqualTo("zp3");
        assertThat(UuidUtil.toString(saved.getValue().getProductId())).isEqualTo(productId);
    }

    @Test
    void aBlankLineOrAnUnknownSupplierIsRejected() {
        assertThatThrownBy(() -> aliases.save(7L, new AliasesRequest(List.of(new AliasDto("  ", productId, null)))))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> aliases.of(8L)).isInstanceOf(DomainException.BadRequest.class);
        verify(repo, never()).save(any());
    }
}
