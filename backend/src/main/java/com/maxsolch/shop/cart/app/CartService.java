package com.maxsolch.shop.cart.app;

import com.maxsolch.shop.cart.domain.CartRules;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.cart.domain.Cart;
import com.maxsolch.shop.cart.domain.CartItem;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.cart.infra.CartItemRepository;
import com.maxsolch.shop.cart.infra.CartRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.cart.domain.CartRules.Line;
import com.maxsolch.shop.cart.domain.CartRules.LineKey;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.cart.app.CartDtos.CartDto;
import com.maxsolch.shop.cart.app.CartDtos.CartLineDto;
import com.maxsolch.shop.cart.app.CartDtos.CartLineInput;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.UnaryOperator;

/**
 * The customer's cart on the server, shared by the website and the Mini App (same Telegram account).
 *
 * <p>Every write locks the customer's {@code carts} row first, so a merge from one device and a
 * replace from another are applied one after the other, never interleaved. Writes are
 * last-write-wins; the {@code version} in every answer lets a client notice that another device
 * changed the cart and re-read it.
 *
 * <p>Lines are stored without prices: the answer always carries today's price, stock and
 * availability, translated to the request language. Lines whose product was hidden or sold out are
 * kept and flagged ({@code available=false}) — the customer sees why it cannot be ordered instead
 * of the item silently vanishing; a deleted product/variant takes its lines with it (FK cascade).
 */
@Service
public class CartService {

    public static final String PROBLEM_INACTIVE = "INACTIVE";
    public static final String PROBLEM_OUT_OF_STOCK = "OUT_OF_STOCK";
    public static final String PROBLEM_VARIANT_REQUIRED = "VARIANT_REQUIRED";

    private final CartRepository cartRepository;
    private final CartItemRepository itemRepository;
    private final ProductRepository productRepository;
    private final TranslationService translationService;
    private final Messages messages;
    private final Clock clock;

    public CartService(CartRepository cartRepository,
                       CartItemRepository itemRepository,
                       ProductRepository productRepository,
                       TranslationService translationService,
                       Messages messages,
                       Clock clock) {
        this.cartRepository = cartRepository;
        this.itemRepository = itemRepository;
        this.productRepository = productRepository;
        this.translationService = translationService;
        this.messages = messages;
        this.clock = clock;
    }

    // ------------------------------------------------------------------ API

    @Transactional(readOnly = true)
    public CartDto get(long userId, String lang) {
        Cart cart = cartRepository.findById(userId).orElse(null);
        List<CartItem> items = cart == null ? List.of() : itemRepository.findByUser(userId);
        return toDto(cart, items, lang);
    }

    /** Replaces the whole cart with these lines (the clients' normal sync write). */
    @Transactional
    public CartDto replace(long userId, List<CartLineInput> input, String lang) {
        checkRequestSize(input);
        List<Line> wanted = CartRules.normalize(raw(input));
        if (wanted.size() > CartRules.MAX_LINES) {
            throw new DomainException.BadRequest(messages.current("api.cart.tooManyLines", CartRules.MAX_LINES));
        }
        Written w = write(userId, current -> wanted, true);
        return toDto(w.cart(), w.items(), lang);
    }

    /** Merges a guest cart into the account's one (see {@link CartRules#merge}). */
    @Transactional
    public CartDto merge(long userId, List<CartLineInput> input, String lang) {
        checkRequestSize(input);
        List<Line> guest = CartRules.normalize(raw(input));
        Written w = write(userId, current -> CartRules.merge(current, guest), true);
        return toDto(w.cart(), w.items(), lang);
    }

    /**
     * Drops the lines that were just ordered. Called by {@link com.maxsolch.shop.order.app.Checkout#createOrder} inside the
     * order's transaction: the order and the emptied cart commit (or roll back) together. The whole
     * line goes, whatever its quantity — the checkout sends the cart's lines as they are.
     */
    @Transactional
    public void removeOrdered(long userId, Collection<LineKey> ordered) {
        if (ordered.isEmpty() || !cartRepository.existsById(userId)) {
            return;
        }
        Set<LineKey> gone = new HashSet<>(ordered);
        write(userId, current -> current.stream().filter(l -> !gone.contains(l.key())).toList(), false);
    }

    // ------------------------------------------------------------------ write

    private record Written(Cart cart, List<CartItem> items) {
    }

    /**
     * Locks the cart, computes the target lines from the current ones and applies the difference
     * (update in place / insert / delete — never delete+insert of one key, which Hibernate would
     * flush in the wrong order against the unique key). Lines pointing at products or variants that
     * do not exist (or a variant of another product) are dropped when {@code validate} is set.
     */
    private Written write(long userId, UnaryOperator<List<Line>> target, boolean validate) {
        cartRepository.ensureExists(userId);
        Cart cart = cartRepository.findForUpdate(userId)
                .orElseThrow(() -> new IllegalStateException("cart row vanished for " + userId));
        List<CartItem> items = itemRepository.findByUser(userId);

        Map<LineKey, CartItem> byKey = new LinkedHashMap<>();
        List<Line> current = new ArrayList<>(items.size());
        for (CartItem it : items) {
            LineKey key = LineKey.of(it.getProductId(), it.getVariantId());
            byKey.put(key, it);
            current.add(new Line(key, it.getQuantity()));
        }

        List<Line> wanted = target.apply(current);
        if (validate) {
            wanted = existing(wanted);
        }

        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        boolean changed = false;
        Set<LineKey> keep = new HashSet<>();
        List<CartItem> added = new ArrayList<>();
        for (Line l : wanted) {
            keep.add(l.key());
            CartItem it = byKey.get(l.key());
            if (it != null) {
                if (it.getQuantity() != l.quantity()) {
                    it.setQuantity(l.quantity());
                    it.setUpdatedAt(now);
                    changed = true;
                }
                continue;
            }
            CartItem fresh = new CartItem();
            fresh.setUserId(userId);
            fresh.setProductId(UuidUtil.toBytes(l.key().productId()));
            fresh.setVariantId(l.key().variantId() == null ? null : UuidUtil.toBytes(l.key().variantId()));
            fresh.setQuantity(l.quantity());
            fresh.setAddedAt(now);
            fresh.setUpdatedAt(now);
            added.add(itemRepository.save(fresh));
            changed = true;
        }
        List<CartItem> result = new ArrayList<>();
        List<CartItem> removed = new ArrayList<>();
        for (Map.Entry<LineKey, CartItem> e : byKey.entrySet()) {
            if (keep.contains(e.getKey())) {
                result.add(e.getValue());
            } else {
                removed.add(e.getValue());
            }
        }
        if (!removed.isEmpty()) {
            itemRepository.deleteAll(removed);
            changed = true;
        }
        result.addAll(added);
        if (changed) {
            cart.setVersion(cart.getVersion() + 1);
            cart.setUpdatedAt(now);
        }
        return new Written(cart, result);
    }

    /** Keeps lines whose product exists and whose variant (if any) belongs to it. */
    private List<Line> existing(List<Line> lines) {
        if (lines.isEmpty()) {
            return lines;
        }
        Map<String, Product> products = loadProducts(lines.stream().map(l -> l.key().productId()).toList());
        List<Line> out = new ArrayList<>(lines.size());
        for (Line l : lines) {
            Product p = products.get(l.key().productId());
            if (p == null) {
                continue;
            }
            if (l.key().variantId() != null && findVariant(p, l.key().variantId()) == null) {
                continue;
            }
            out.add(l);
        }
        return out;
    }

    private static List<CartRules.RawLine> raw(List<CartLineInput> input) {
        if (input == null) {
            return null;
        }
        List<CartRules.RawLine> out = new ArrayList<>(input.size());
        for (CartLineInput in : input) {
            out.add(in == null ? null : new CartRules.RawLine(in.productId(), in.variantId(), in.quantity()));
        }
        return out;
    }

    private void checkRequestSize(List<CartLineInput> input) {
        if (input != null && input.size() > CartRules.MAX_REQUEST_LINES) {
            throw new DomainException.BadRequest(messages.current("api.cart.tooLarge"));
        }
    }

    // ------------------------------------------------------------------ read model

    private CartDto toDto(Cart cart, List<CartItem> items, String lang) {
        long version = cart == null ? 0 : cart.getVersion();
        Instant updatedAt = cart == null ? null : cart.getUpdatedAt();
        if (items.isEmpty()) {
            return new CartDto(version, updatedAt, List.of(), CartRules.MAX_LINES, CartRules.MAX_QUANTITY);
        }
        Map<String, Product> products = loadProducts(items.stream()
                .map(i -> UuidUtil.toString(i.getProductId())).toList());
        TranslationService.Overlay overlay = translationService.overlay(lang);

        List<CartLineDto> lines = new ArrayList<>(items.size());
        for (CartItem it : items) {
            String productId = UuidUtil.toString(it.getProductId());
            Product p = products.get(productId);
            if (p == null) {
                continue; // deleted in this very transaction; the FK cascade removes the row
            }
            String variantId = it.getVariantId() == null ? null : UuidUtil.toString(it.getVariantId());
            ProductVariant variant = variantId == null ? null : findVariant(p, variantId);
            if (variantId != null && variant == null) {
                continue;
            }
            lines.add(lineDto(p, variant, it, overlay));
        }
        return new CartDto(version, updatedAt, lines, CartRules.MAX_LINES, CartRules.MAX_QUANTITY);
    }

    static CartLineDto lineDto(Product p, ProductVariant variant, CartItem it, TranslationService.Overlay overlay) {
        String productId = UuidUtil.toString(p.getId());
        String variantId = variant == null ? null : UuidUtil.toString(variant.getId());
        boolean hasVariants = p.getVariants() != null && !p.getVariants().isEmpty();
        int stock = stockOf(p, variant);
        String problem = null;
        if (!p.isActive() || p.isArchived()) {
            problem = PROBLEM_INACTIVE;
        } else if (variant == null && hasVariants) {
            problem = PROBLEM_VARIANT_REQUIRED;
        } else if (stock <= 0) {
            problem = PROBLEM_OUT_OF_STOCK;
        }
        return new CartLineDto(
                productId,
                variantId,
                it.getQuantity(),
                overlay.text(TranslationEntityType.PRODUCT, productId, TranslationEntityType.TITLE, p.getTitle()),
                p.getSlug(),
                variant == null ? null
                        : overlay.text(TranslationEntityType.VARIANT, variantId, TranslationEntityType.NAME, variant.getName()),
                firstImage(p),
                p.getPriceMinor(),
                p.getCompareAtMinor(),
                p.getCurrency(),
                Math.max(0, stock),
                problem == null,
                problem,
                it.getAddedAt());
    }

    /** Same rule as the checkout and the site: the variant's own, else the sum of variants, else the product's. */
    static int stockOf(Product p, ProductVariant variant) {
        if (variant != null) {
            return variant.getStock();
        }
        if (p.getVariants() != null && !p.getVariants().isEmpty()) {
            return p.getVariants().stream().mapToInt(v -> Math.max(0, v.getStock())).sum();
        }
        return p.getStock();
    }

    private static String firstImage(Product p) {
        if (p.getImages() == null || p.getImages().isEmpty()) {
            return null;
        }
        return p.getImages().stream()
                .min(Comparator.comparingInt(ProductImage::getSortOrder)
                        .thenComparing(i -> i.getId() == null ? Long.MAX_VALUE : i.getId()))
                .map(ProductImage::getUrl)
                .orElse(null);
    }

    private static ProductVariant findVariant(Product p, String variantId) {
        if (p.getVariants() == null) {
            return null;
        }
        for (ProductVariant v : p.getVariants()) {
            if (variantId.equals(UuidUtil.toString(v.getId()))) {
                return v;
            }
        }
        return null;
    }

    private Map<String, Product> loadProducts(Collection<String> ids) {
        Map<String, byte[]> unique = new LinkedHashMap<>();
        for (String id : ids) {
            unique.putIfAbsent(id, UuidUtil.toBytes(id));
        }
        Map<String, Product> out = new HashMap<>();
        for (Product p : productRepository.findAllById(unique.values())) {
            out.put(UuidUtil.toString(p.getId()), p);
        }
        return out;
    }
}
