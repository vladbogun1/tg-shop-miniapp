package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Cart;
import com.maxsolch.shop.domain.CartItem;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.repository.CartItemRepository;
import com.maxsolch.shop.repository.CartRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.dto.CartDtos.CartDto;
import com.maxsolch.shop.web.dto.CartDtos.CartLineDto;
import com.maxsolch.shop.web.dto.CartDtos.CartLineInput;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * CartService against in-memory fakes of the repositories: what is stored after replace / merge /
 * removal at checkout, the caps, and how unavailable products are reported.
 */
@ExtendWith(MockitoExtension.class)
class CartServiceTest {

    private static final long USER = 42L;

    @Mock
    CartRepository cartRepository;
    @Mock
    CartItemRepository itemRepository;
    @Mock
    ProductRepository productRepository;
    @Mock
    TranslationService translationService;
    @Mock
    Messages messages;

    CartService service;

    /** The "database". */
    final Cart cart = new Cart();
    final List<CartItem> rows = new ArrayList<>();
    final Map<String, Product> catalog = new HashMap<>();
    final AtomicLong ids = new AtomicLong();

    @BeforeEach
    void setUp() {
        service = new CartService(cartRepository, itemRepository, productRepository, translationService, messages);
        cart.setUserId(USER);
        cart.setVersion(0);
        cart.setUpdatedAt(Instant.EPOCH);

        lenient().when(messages.current(anyString(), any(Object[].class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(messages.current(anyString())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(translationService.overlay(any())).thenReturn(new TranslationService.Overlay(Map.of()));
        lenient().when(cartRepository.findForUpdate(USER)).thenReturn(Optional.of(cart));
        lenient().when(cartRepository.findById(USER)).thenReturn(Optional.of(cart));
        lenient().when(cartRepository.existsById(USER)).thenReturn(true);
        lenient().when(itemRepository.findByUser(USER)).thenAnswer(inv -> new ArrayList<>(rows));
        lenient().when(itemRepository.save(any(CartItem.class))).thenAnswer(inv -> {
            CartItem it = inv.getArgument(0);
            it.setId(ids.incrementAndGet());
            rows.add(it);
            return it;
        });
        lenient().doAnswer(inv -> {
            Collection<CartItem> gone = inv.getArgument(0);
            rows.removeAll(gone);
            return null;
        }).when(itemRepository).deleteAll(any());
        lenient().when(productRepository.findAllById(any())).thenAnswer(inv -> {
            List<Product> out = new ArrayList<>();
            for (byte[] id : (Iterable<byte[]>) inv.getArgument(0)) {
                Product p = catalog.get(UuidUtil.toString(id));
                if (p != null) {
                    out.add(p);
                }
            }
            return out;
        });
    }

    private Product product(int stock) {
        Product p = new Product();
        p.setId(UuidUtil.randomBytes());
        p.setTitle("Товар " + catalog.size());
        p.setSlug("tovar-" + catalog.size());
        p.setPriceMinor(10_000);
        p.setStock(stock);
        p.setActive(true);
        p.setArchived(false);
        p.setVariants(new ArrayList<>());
        p.setImages(new ArrayList<>());
        catalog.put(UuidUtil.toString(p.getId()), p);
        return p;
    }

    private ProductVariant variant(Product p, int stock) {
        ProductVariant v = new ProductVariant();
        v.setId(UuidUtil.randomBytes());
        v.setProduct(p);
        v.setName("M");
        v.setStock(stock);
        p.getVariants().add(v);
        return v;
    }

    private static String id(Product p) {
        return UuidUtil.toString(p.getId());
    }

    private static String id(ProductVariant v) {
        return UuidUtil.toString(v.getId());
    }

    private static CartLineInput in(Product p, ProductVariant v, int qty) {
        return new CartLineInput(id(p), v == null ? null : id(v), qty);
    }

    // ---------------------------------------------------------------- replace

    @Test
    void replace_storesLines_andBumpsVersion() {
        Product a = product(5);
        Product b = product(5);

        CartDto dto = service.replace(USER, List.of(in(a, null, 2), in(b, null, 1)), "ru");

        assertThat(dto.version()).isEqualTo(1);
        assertThat(dto.lines()).extracting(CartLineDto::productId).containsExactly(id(a), id(b));
        assertThat(dto.lines()).extracting(CartLineDto::quantity).containsExactly(2, 1);
        verify(cartRepository).ensureExists(USER);
    }

    @Test
    void replace_updatesInPlace_removesMissing_andKeepsVersionWhenNothingChanged() {
        Product a = product(5);
        Product b = product(5);
        service.replace(USER, List.of(in(a, null, 2), in(b, null, 1)), "ru");
        Long rowIdOfA = rows.get(0).getId();

        CartDto dto = service.replace(USER, List.of(in(a, null, 4)), "ru");

        assertThat(dto.version()).isEqualTo(2);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getId()).isEqualTo(rowIdOfA); // updated, not re-inserted
        assertThat(rows.get(0).getQuantity()).isEqualTo(4);

        CartDto same = service.replace(USER, List.of(in(a, null, 4)), "ru");
        assertThat(same.version()).isEqualTo(2);
    }

    @Test
    void replace_dropsUnknownProducts_andVariantsOfOtherProducts() {
        Product a = product(5);
        Product b = product(5);
        ProductVariant ofB = variant(b, 3);

        CartDto dto = service.replace(USER, List.of(
                new CartLineInput(UUID.randomUUID().toString(), null, 1), // not in the catalog
                new CartLineInput(id(a), id(ofB), 1),                     // b's variant on a
                in(b, ofB, 2)), "ru");

        assertThat(dto.lines()).hasSize(1);
        assertThat(dto.lines().get(0).variantId()).isEqualTo(id(ofB));
    }

    @Test
    void replace_rejectsMoreThanMaxLines() {
        List<CartLineInput> many = new ArrayList<>();
        for (int i = 0; i <= CartRules.MAX_LINES; i++) {
            many.add(in(product(1), null, 1));
        }

        assertThatThrownBy(() -> service.replace(USER, many, "ru"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.cart.tooManyLines");
        verify(itemRepository, never()).save(any());
    }

    @Test
    void replace_rejectsOversizedRequest() {
        List<CartLineInput> many = new ArrayList<>();
        Product a = product(1);
        for (int i = 0; i <= CartRules.MAX_REQUEST_LINES; i++) {
            many.add(in(a, null, 1));
        }

        assertThatThrownBy(() -> service.replace(USER, many, "ru"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.cart.tooLarge");
    }

    @Test
    void replace_clampsQuantityToMax() {
        Product a = product(500);

        CartDto dto = service.replace(USER, List.of(in(a, null, 1000)), "ru");

        assertThat(dto.lines().get(0).quantity()).isEqualTo(CartRules.MAX_QUANTITY);
    }

    // ---------------------------------------------------------------- merge

    @Test
    void merge_takesMaxPerLine_andAppendsGuestLines() {
        Product a = product(9);
        Product b = product(9);
        service.replace(USER, List.of(in(a, null, 3)), "ru");

        CartDto dto = service.merge(USER, List.of(in(a, null, 1), in(b, null, 2), in(b, null, 1)), "ru");

        assertThat(dto.lines()).extracting(CartLineDto::productId).containsExactly(id(a), id(b));
        assertThat(dto.lines()).extracting(CartLineDto::quantity).containsExactly(3, 3); // max(3,1); 2+1
        assertThat(rows).hasSize(2);

        CartDto again = service.merge(USER, List.of(in(a, null, 1), in(b, null, 2), in(b, null, 1)), "ru");
        assertThat(again.version()).isEqualTo(dto.version()); // idempotent
    }

    // ---------------------------------------------------------------- read model

    @Test
    void get_flagsInactiveOutOfStockAndMissingVariant() {
        Product ok = product(5);
        Product hidden = product(5);
        Product soldOut = product(0);
        Product gotVariants = product(5);
        service.replace(USER, List.of(in(ok, null, 1), in(hidden, null, 1), in(soldOut, null, 1),
                in(gotVariants, null, 1)), "ru");
        hidden.setActive(false);
        variant(gotVariants, 5);

        CartDto dto = service.get(USER, "ru");

        assertThat(dto.lines()).extracting(CartLineDto::available).containsExactly(true, false, false, false);
        assertThat(dto.lines()).extracting(CartLineDto::problem).containsExactly(
                null, CartService.PROBLEM_INACTIVE, CartService.PROBLEM_OUT_OF_STOCK,
                CartService.PROBLEM_VARIANT_REQUIRED);
        assertThat(dto.lines().get(1).quantity()).isEqualTo(1); // kept, not dropped
    }

    @Test
    void get_reportsCurrentPriceStockAndFirstImage() {
        Product a = product(5);
        ProductVariant v = variant(a, 2);
        ProductImage second = new ProductImage();
        second.setId(2L);
        second.setUrl("b.jpg");
        second.setSortOrder(1);
        ProductImage first = new ProductImage();
        first.setId(3L);
        first.setUrl("a.jpg");
        first.setSortOrder(0);
        a.getImages().add(second);
        a.getImages().add(first);
        service.replace(USER, List.of(in(a, v, 1)), "ru");
        a.setPriceMinor(12_345);

        CartLineDto line = service.get(USER, "ru").lines().get(0);

        assertThat(line.priceMinor()).isEqualTo(12_345);
        assertThat(line.stock()).isEqualTo(2);
        assertThat(line.variantName()).isEqualTo("M");
        assertThat(line.imageUrl()).isEqualTo("a.jpg");
        assertThat(line.slug()).isEqualTo(a.getSlug());
    }

    @Test
    void get_withoutCart_isEmptyVersionZero() {
        when(cartRepository.findById(USER)).thenReturn(Optional.empty());

        CartDto dto = service.get(USER, "uk");

        assertThat(dto.version()).isZero();
        assertThat(dto.lines()).isEmpty();
        assertThat(dto.maxLines()).isEqualTo(CartRules.MAX_LINES);
    }

    // ---------------------------------------------------------------- after an order

    @Test
    void removeOrdered_dropsOnlyTheOrderedLines_andBumpsVersion() {
        Product a = product(5);
        Product b = product(5);
        ProductVariant v = variant(b, 5);
        service.replace(USER, List.of(in(a, null, 2), in(b, v, 1)), "ru");
        long before = cart.getVersion();

        service.removeOrdered(USER, List.of(new CartRules.LineKey(id(b), id(v))));

        assertThat(rows).hasSize(1);
        assertThat(UuidUtil.toString(rows.get(0).getProductId())).isEqualTo(id(a));
        assertThat(cart.getVersion()).isEqualTo(before + 1);
    }

    @Test
    void removeOrdered_withoutCart_doesNothing() {
        when(cartRepository.existsById(USER)).thenReturn(false);

        service.removeOrdered(USER, List.of(new CartRules.LineKey(UUID.randomUUID().toString(), null)));

        verify(cartRepository, never()).ensureExists(anyLong());
        verify(cartRepository, never()).findForUpdate(anyLong());
    }

    @Test
    void clear_removesEverything() {
        Product a = product(5);
        service.replace(USER, List.of(in(a, null, 2)), "ru");

        CartDto dto = service.clear(USER, "ru");

        assertThat(dto.lines()).isEmpty();
        assertThat(rows).isEmpty();
        assertThat(dto.version()).isEqualTo(2);
    }
}
