package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.tg.NotificationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Order lifecycle and business rules: stock, promo, delivery/payment snapshots, status transitions.
 * Owns notifications (best-effort) on create and every transition.
 */
@Slf4j
@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final PromoCodeRepository promoCodeRepository;
    private final PaymentOptionRepository paymentOptionRepository;
    private final NotificationService notificationService;

    public OrderService(OrderRepository orderRepository,
                        ProductRepository productRepository,
                        PromoCodeRepository promoCodeRepository,
                        PaymentOptionRepository paymentOptionRepository,
                        NotificationService notificationService) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.promoCodeRepository = promoCodeRepository;
        this.paymentOptionRepository = paymentOptionRepository;
        this.notificationService = notificationService;
    }

    /**
     * Validate availability + variants, resolve/apply promo (fixed beats percent), decrement
     * stock (variant + product rollup), snapshot delivery & payment, persist with status NEW,
     * then notify (channel card + optional customer DM).
     */
    @Transactional
    public Order createOrder(CreateOrderCommand cmd) {
        if (cmd.items() == null || cmd.items().isEmpty()) {
            throw new BadRequestException("order has no items");
        }

        DeliveryMethod deliveryMethod = parseDelivery(cmd.deliveryMethod());

        // Accumulate duplicate (productId, variantId) lines into a single requested quantity.
        Map<String, AccLine> acc = new LinkedHashMap<>();
        for (CreateOrderCommand.Line line : cmd.items()) {
            if (line.quantity() <= 0) {
                throw new BadRequestException("quantity must be positive");
            }
            String key = line.productId() + "::" + (line.variantId() == null ? "" : line.variantId());
            acc.computeIfAbsent(key, k -> new AccLine(line.productId(), line.variantId()))
                    .quantity += line.quantity();
        }

        Order order = new Order();
        order.setCurrency("UAH");
        order.setStatus(OrderStatus.NEW);
        order.setCustomerName(required(cmd.customerName(), "customerName"));
        order.setPhone(required(cmd.phone(), "phone"));
        order.setComment(cmd.comment());
        order.setUserId(cmd.userId());
        order.setTgUserId(cmd.tgUserId());
        order.setTgUsername(cmd.tgUsername());

        order.setDeliveryMethod(deliveryMethod);
        if (deliveryMethod == DeliveryMethod.NOVA_POSHTA) {
            order.setNpCityRef(cmd.npCityRef());
            order.setNpCityName(cmd.npCityName());
            order.setNpWarehouseRef(cmd.npWarehouseRef());
            order.setNpWarehouseName(cmd.npWarehouseName());
        }

        // Payment option snapshot.
        if (cmd.paymentOptionId() != null && !cmd.paymentOptionId().isBlank()) {
            PaymentOption po = paymentOptionRepository.findById(toBytes(cmd.paymentOptionId(), "paymentOptionId"))
                    .orElseThrow(() -> new BadRequestException("unknown payment option"));
            order.setPaymentOptionId(po.getId());
            order.setPaymentOptionTitle(po.getTitle());
            order.setPrepaymentMinor(po.isRequiresPrepayment() ? po.getPrepaymentMinor() : 0);
        }

        long subtotal = 0;
        List<Product> toSave = new ArrayList<>();
        for (AccLine line : acc.values()) {
            Product product = productRepository.findByIdWithDetails(toBytes(line.productId, "productId"))
                    .orElseThrow(() -> new BadRequestException("unknown product: " + line.productId));
            if (!product.isActive() || product.isArchived()) {
                throw new BadRequestException("product not available: " + product.getTitle());
            }

            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setProductId(product.getId());
            item.setTitleSnapshot(product.getTitle());
            item.setPriceMinorSnapshot(product.getPriceMinor());
            item.setQuantity(line.quantity);

            boolean hasVariants = product.getVariants() != null && !product.getVariants().isEmpty();
            if (line.variantId != null && !line.variantId.isBlank()) {
                ProductVariant variant = findVariant(product, line.variantId);
                if (variant == null) {
                    throw new BadRequestException("variant does not belong to product: " + line.variantId);
                }
                if (variant.getStock() < line.quantity) {
                    throw new BadRequestException("not enough stock for variant: " + variant.getName());
                }
                variant.setStock(variant.getStock() - line.quantity);
                item.setVariantId(variant.getId());
                item.setVariantNameSnapshot(variant.getName());
            } else if (hasVariants) {
                throw new BadRequestException("variant is required for product: " + product.getTitle());
            } else {
                if (product.getStock() < line.quantity) {
                    throw new BadRequestException("not enough stock for product: " + product.getTitle());
                }
            }

            // Product-level stock rollup: always decrement product stock by the quantity
            // (variant decrement is in addition to the variant's own counter).
            product.setStock(Math.max(0, product.getStock() - line.quantity));

            subtotal += product.getPriceMinor() * (long) line.quantity;
            order.getItems().add(item);
            toSave.add(product);
        }

        // Promo: fixed amount takes priority over percent.
        long discount = 0;
        PromoCode promo = resolvePromo(cmd.promoCode());
        if (promo != null) {
            if (promo.getDiscountAmountMinor() > 0) {
                discount = Math.min(promo.getDiscountAmountMinor(), subtotal);
            } else if (promo.getDiscountPercent() > 0) {
                discount = subtotal * promo.getDiscountPercent() / 100;
            }
            order.setPromoCode(promo.getCode());
            promo.setUsesCount(promo.getUsesCount() + 1);
            promoCodeRepository.save(promo);
        }

        order.setSubtotalMinor(subtotal);
        order.setDiscountMinor(discount);
        order.setTotalMinor(Math.max(0, subtotal - discount));

        productRepository.saveAll(toSave);
        Order saved = orderRepository.save(order);

        notificationService.onNewOrder(saved);
        notificationService.notifyCustomerStatus(saved);
        return saved;
    }

    @Transactional
    public Order approve(byte[] orderId) {
        Order order = get(orderId);
        if (order.getStatus() != OrderStatus.NEW) {
            throw new BadRequestException("only NEW orders can be approved");
        }
        order.setStatus(OrderStatus.APPROVED);
        order.setApprovedAt(Instant.now());
        Order saved = afterTransition(order);
        // Post a dispatch card (what to ship / how much COD to collect) to the seller topic.
        notificationService.onApprovedDispatch(saved);
        return saved;
    }

    @Transactional
    public Order ship(byte[] orderId, String trackingNumber) {
        Order order = get(orderId);
        if (order.getStatus() != OrderStatus.APPROVED && order.getStatus() != OrderStatus.NEW) {
            throw new BadRequestException("order must be NEW or APPROVED to ship");
        }
        order.setStatus(OrderStatus.SHIPPED);
        order.setShippedAt(Instant.now());
        if (trackingNumber != null && !trackingNumber.isBlank()) {
            order.setTrackingNumber(trackingNumber.trim());
        }
        return afterTransition(order);
    }

    @Transactional
    public Order deliver(byte[] orderId) {
        Order order = get(orderId);
        if (order.getStatus() != OrderStatus.SHIPPED) {
            throw new BadRequestException("only SHIPPED orders can be delivered");
        }
        order.setStatus(OrderStatus.DELIVERED);
        order.setDeliveredAt(Instant.now());
        // Delivered ⇒ fully settled (COD collected on delivery + any prepayment). Record the
        // full amount as received so наложка is 0 and it's never delivered-but-unpaid.
        order.setReceivedMinor(order.getTotalMinor());
        if (!order.isPaid()) {
            order.setPaid(true);
            order.setPaidAt(Instant.now());
        }
        return afterTransition(order);
    }

    /**
     * Customer-initiated cancellation — allowed only while the order is NOT paid and still
     * NEW/APPROVED (e.g. a card problem). Restores stock and moves the order to REJECTED
     * with a customer reason.
     */
    @Transactional
    public Order cancelByCustomer(byte[] orderId, String reason) {
        Order order = get(orderId);
        if (order.isPaid()) {
            throw new BadRequestException("оплаченный заказ нельзя отменить — напишите в чат");
        }
        if (order.getStatus() != OrderStatus.NEW && order.getStatus() != OrderStatus.APPROVED) {
            throw new BadRequestException("этот заказ уже нельзя отменить");
        }
        restoreStock(order);
        order.setStatus(OrderStatus.REJECTED);
        order.setRejectedAt(Instant.now());
        String r = reason == null ? "" : reason.trim();
        order.setRejectReason(r.isBlank() ? "Отменён покупателем" : "Отменён покупателем: " + r);
        return afterTransition(order);
    }

    /**
     * Admin reject/cancel. Allowed from ANY status (incl. DELIVERED — e.g. a customer
     * return at Nova Poshta). {@code restock} controls whether the items go back on the
     * shelf (skip it when the returned goods are not in sellable condition).
     */
    @Transactional
    public Order reject(byte[] orderId, String reason, boolean restock) {
        Order order = get(orderId);
        if (order.getStatus() == OrderStatus.REJECTED) {
            throw new BadRequestException("order already rejected");
        }
        if (restock) {
            restoreStock(order);
        }
        order.setStatus(OrderStatus.REJECTED);
        order.setRejectedAt(Instant.now());
        order.setRejectReason(reason);
        return afterTransition(order);
    }

    /** Dispatcher used by the admin board / status PATCH endpoint. */
    @Transactional
    public Order changeStatus(byte[] orderId, OrderStatus target, String trackingNumber,
                              String reason, boolean restock) {
        return switch (target) {
            case APPROVED -> approve(orderId);
            case SHIPPED -> ship(orderId, trackingNumber);
            case DELIVERED -> deliver(orderId);
            case REJECTED -> reject(orderId, reason, restock);
            case NEW -> throw new BadRequestException("cannot transition back to NEW");
        };
    }

    @Transactional(readOnly = true)
    public Order get(byte[] orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("order not found"));
    }

    /**
     * Sync the seller "К ОТПРАВКЕ" topic with the current APPROVED orders. For each order we
     * reconcile its card with Telegram: missing cards are posted, manually-deleted cards are
     * re-posted, and existing cards are refreshed in place. Idempotent — pressing the button
     * repeatedly never creates duplicates. Returns how many cards were (re)posted.
     */
    @Transactional
    public int broadcastDispatch() {
        List<Order> approved = orderRepository.findByStatusOrderByCreatedAtDesc(OrderStatus.APPROVED);
        int posted = 0;
        for (Order o : approved) {
            if (notificationService.syncDispatchCard(o)) {
                posted++;
            }
        }
        return posted;
    }

    /** Flip the order's paid flag (customer payment-proof upload, or admin correction). */
    @Transactional
    public Order markPaid(byte[] orderId, long receivedMinor) {
        Order order = get(orderId);
        long received = Math.max(0, Math.min(receivedMinor, order.getTotalMinor()));
        order.setReceivedMinor(received);
        boolean paid = received > 0;
        order.setPaid(paid);
        order.setPaidAt(paid ? Instant.now() : null);
        return orderRepository.save(order);
    }

    // ----- admin order editing: gifts & discounts -----

    /** Admin adds a FREE gift product to an order: stock is decremented (unit is reserved),
     *  the item is added at price 0 (so total/наложка don't change), gifts merge by product+variant. */
    @Transactional
    public Order addGift(byte[] orderId, String productId, String variantId, int qty, boolean notifyCustomer) {
        Order order = get(orderId);
        requireEditable(order);
        if (qty < 1) {
            throw new BadRequestException("quantity must be >= 1");
        }
        Product product = productRepository.findByIdWithDetails(toBytes(productId, "productId"))
                .orElseThrow(() -> new BadRequestException("unknown product: " + productId));
        if (product.isArchived()) {
            throw new BadRequestException("product is archived: " + product.getTitle());
        }
        boolean hasVariants = product.getVariants() != null && !product.getVariants().isEmpty();
        ProductVariant variant = null;
        if (hasVariants) {
            if (variantId == null || variantId.isBlank()) {
                throw new BadRequestException("variant is required for product: " + product.getTitle());
            }
            variant = findVariant(product, variantId);
            if (variant == null) {
                throw new BadRequestException("variant does not belong to product: " + variantId);
            }
        }
        reserveStock(product, variant, qty);

        byte[] vId = variant == null ? null : variant.getId();
        OrderItem existing = order.getItems().stream()
                .filter(OrderItem::isGift)
                .filter(i -> java.util.Arrays.equals(i.getProductId(), product.getId()))
                .filter(i -> java.util.Arrays.equals(i.getVariantId(), vId))
                .findFirst().orElse(null);
        if (existing != null) {
            existing.setQuantity(existing.getQuantity() + qty);
        } else {
            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setProductId(product.getId());
            item.setTitleSnapshot(product.getTitle());
            item.setPriceMinorSnapshot(0);
            item.setQuantity(qty);
            item.setGift(true);
            if (variant != null) {
                item.setVariantId(variant.getId());
                item.setVariantNameSnapshot(variant.getName());
            }
            order.getItems().add(item);
        }
        productRepository.save(product);
        recomputeTotals(order);
        Order saved = orderRepository.save(order);
        refreshDispatch(saved);
        if (notifyCustomer) {
            notificationService.notifyCustomerGift(saved, product.getTitle(),
                    variant == null ? null : variant.getName(), qty);
        }
        return saved;
    }

    /** Admin removes an order item (a gift or a line), restoring its stock and recomputing totals. */
    @Transactional
    public Order removeItem(byte[] orderId, long itemId) {
        Order order = get(orderId);
        requireEditable(order);
        OrderItem item = order.getItems().stream()
                .filter(i -> i.getId() != null && i.getId() == itemId)
                .findFirst()
                .orElseThrow(() -> new NotFoundException("order item not found"));
        restoreItemStock(item);
        order.getItems().remove(item);
        recomputeTotals(order);
        Order saved = orderRepository.save(order);
        refreshDispatch(saved);
        return saved;
    }

    /** Admin applies / updates / removes a discount: an existing promo code, or a manual amount/percent. */
    @Transactional
    public Order applyDiscount(byte[] orderId, String promoCode, Long amountMinor,
                               Integer percent, boolean clear, boolean notifyCustomer) {
        Order order = get(orderId);
        requireEditable(order);
        long subtotal = order.getItems().stream()
                .mapToLong(i -> i.getPriceMinorSnapshot() * (long) i.getQuantity()).sum();

        // Release any previous REAL promo usage before re-applying.
        releasePromoUsage(order.getPromoCode());

        long discount = 0;
        if (clear) {
            order.setPromoCode(null);
        } else if (promoCode != null && !promoCode.isBlank()) {
            PromoCode p = resolvePromo(promoCode);
            discount = p.getDiscountAmountMinor() > 0
                    ? Math.min(p.getDiscountAmountMinor(), subtotal)
                    : subtotal * p.getDiscountPercent() / 100;
            p.setUsesCount(p.getUsesCount() + 1);
            promoCodeRepository.save(p);
            order.setPromoCode(p.getCode());
        } else if (amountMinor != null && amountMinor > 0) {
            discount = Math.min(amountMinor, subtotal);
            order.setPromoCode("Ручная скидка");
        } else if (percent != null && percent > 0) {
            int pc = Math.min(percent, 100);
            discount = subtotal * pc / 100;
            order.setPromoCode("Ручная скидка " + pc + "%");
        } else {
            order.setPromoCode(null);
        }

        order.setSubtotalMinor(subtotal);
        order.setDiscountMinor(Math.min(Math.max(0, discount), subtotal));
        order.setTotalMinor(Math.max(0, subtotal - order.getDiscountMinor()));
        Order saved = orderRepository.save(order);
        refreshDispatch(saved);
        if (notifyCustomer && saved.getDiscountMinor() > 0) {
            notificationService.notifyCustomerDiscount(saved);
        }
        return saved;
    }

    // ----- helpers -----

    /** Order composition/discount may only be edited before dispatch. */
    private void requireEditable(Order order) {
        OrderStatus s = order.getStatus();
        if (s != OrderStatus.NEW && s != OrderStatus.APPROVED) {
            throw new BadRequestException("заказ можно менять только в статусе «Новый» или «Одобрен»");
        }
    }

    /** Decrement stock for one product/variant line (reserves the units). */
    private void reserveStock(Product product, ProductVariant variant, int qty) {
        if (variant != null) {
            if (variant.getStock() < qty) {
                throw new BadRequestException("not enough stock for variant: " + variant.getName());
            }
            variant.setStock(variant.getStock() - qty);
        } else if (product.getStock() < qty) {
            throw new BadRequestException("not enough stock for product: " + product.getTitle());
        }
        product.setStock(Math.max(0, product.getStock() - qty));
    }

    /** Return one item's units to product + variant stock. */
    private void restoreItemStock(OrderItem item) {
        productRepository.findByIdWithDetails(item.getProductId()).ifPresent(product -> {
            product.setStock(product.getStock() + item.getQuantity());
            if (item.getVariantId() != null) {
                ProductVariant variant = findVariant(product, UuidUtil.toString(item.getVariantId()));
                if (variant != null) {
                    variant.setStock(variant.getStock() + item.getQuantity());
                }
            }
            productRepository.save(product);
        });
    }

    /** Recompute subtotal from items; keep the stored (absolute) discount capped at subtotal. */
    private void recomputeTotals(Order order) {
        long subtotal = order.getItems().stream()
                .mapToLong(i -> i.getPriceMinorSnapshot() * (long) i.getQuantity()).sum();
        order.setSubtotalMinor(subtotal);
        long discount = Math.min(Math.max(0, order.getDiscountMinor()), subtotal);
        order.setDiscountMinor(discount);
        order.setTotalMinor(Math.max(0, subtotal - discount));
    }

    /** Decrement usesCount of a previously-applied REAL promo code (ignores manual-discount labels). */
    private void releasePromoUsage(String code) {
        if (code == null || code.isBlank()) {
            return;
        }
        promoCodeRepository.findByCode(code).ifPresent(p -> {
            if (p.getUsesCount() > 0) {
                p.setUsesCount(p.getUsesCount() - 1);
                promoCodeRepository.save(p);
            }
        });
    }

    /** After an edit, refresh the seller dispatch card if the order is APPROVED. */
    private void refreshDispatch(Order order) {
        if (order.getStatus() == OrderStatus.APPROVED) {
            notificationService.syncDispatchCard(order);
        }
    }

    private Order afterTransition(Order order) {
        Order saved = orderRepository.save(order);
        notificationService.onStatusChanged(saved);
        notificationService.notifyCustomerStatus(saved);
        // Once an order leaves APPROVED (shipped / delivered / cancelled) it no longer belongs in
        // the seller's "К ОТПРАВКЕ" topic — remove its dispatch card. Re-approval re-posts it.
        if (saved.getStatus() != OrderStatus.APPROVED) {
            notificationService.removeDispatchCard(saved);
        }
        return saved;
    }

    private void restoreStock(Order order) {
        for (OrderItem item : order.getItems()) {
            restoreItemStock(item);
        }
    }

    private ProductVariant findVariant(Product product, String variantId) {
        if (product.getVariants() == null) {
            return null;
        }
        byte[] vid = toBytes(variantId, "variantId");
        return product.getVariants().stream()
                .filter(v -> java.util.Arrays.equals(v.getId(), vid))
                .findFirst()
                .orElse(null);
    }

    private PromoCode resolvePromo(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        Optional<PromoCode> opt = promoCodeRepository.findByCodeAndActiveTrue(code.trim());
        if (opt.isEmpty()) {
            throw new BadRequestException("invalid promo code");
        }
        PromoCode promo = opt.get();
        if (promo.getMaxUses() != null && promo.getUsesCount() >= promo.getMaxUses()) {
            throw new BadRequestException("promo code usage limit reached");
        }
        return promo;
    }

    private DeliveryMethod parseDelivery(String value) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException("deliveryMethod is required");
        }
        try {
            return DeliveryMethod.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("unknown deliveryMethod: " + value);
        }
    }

    private byte[] toBytes(String uuid, String field) {
        try {
            return UuidUtil.toBytes(uuid);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("invalid " + field + ": " + uuid);
        }
    }

    private String required(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException(field + " is required");
        }
        return value.trim();
    }

    private static final class AccLine {
        final String productId;
        final String variantId;
        int quantity;

        AccLine(String productId, String variantId) {
            this.productId = productId;
            this.variantId = variantId;
        }
    }
}
