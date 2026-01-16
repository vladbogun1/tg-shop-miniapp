package com.example.tgshop.order;

import com.example.tgshop.common.UuidUtil;
import com.example.tgshop.promo.PromoCode;
import com.example.tgshop.promo.PromoCodeRepository;
import com.example.tgshop.product.Product;
import com.example.tgshop.product.ProductVariant;
import com.example.tgshop.product.ProductRepository;
import com.example.tgshop.tg.TelegramNotifyService;
import jakarta.transaction.Transactional;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class OrderService {

    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final PromoCodeRepository promoCodeRepository;
    private final TelegramNotifyService notifyService;

    public OrderService(
            ProductRepository productRepository,
            OrderRepository orderRepository,
            PromoCodeRepository promoCodeRepository,
            TelegramNotifyService notifyService
    ) {
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
        this.promoCodeRepository = promoCodeRepository;
        this.notifyService = notifyService;
    }

    @Transactional
    public OrderEntity createOrder(CreateOrderCommand cmd) {
        log.info("🧾 ORDER Creating order for tgUserId={} items={}", cmd.tgUserId(), cmd.items().size());
        Map<UUID, Product> products = new HashMap<>();
        Map<UUID, Integer> productTotals = new HashMap<>();
        Map<UUID, Integer> variantTotals = new HashMap<>();

        for (var item : cmd.items()) {
            var pid = item.productId();
            var p = productRepository.findById(UuidUtil.toBytes(pid))
                    .orElseThrow(() -> {
                        log.warn("🧾 ORDER Order rejected: product not found {}", pid);
                        return new IllegalArgumentException("Product not found: " + pid);
                    });
            if (!p.isActive()) {
                log.warn("🧾 ORDER Order rejected: product inactive {}", pid);
                throw new IllegalArgumentException("Product inactive: " + pid);
            }
            ProductVariant variant = resolveVariant(p, item.variantId());
            if (variant != null) {
                UUID vid = variant.uuid();
                int nextVariantTotal = variantTotals.merge(vid, item.quantity(), Integer::sum);
                if (variant.getStock() < nextVariantTotal) {
                    log.warn("🧾 ORDER Order rejected: not enough stock product={} variant={} requestedTotal={} available={}",
                            p.getTitle(), variant.getName(), nextVariantTotal, variant.getStock());
                    throw new IllegalArgumentException("Not enough stock: " + p.getTitle());
                }
            } else {
                int nextTotal = productTotals.merge(pid, item.quantity(), Integer::sum);
                if (p.getStock() < nextTotal) {
                    log.warn("🧾 ORDER Order rejected: not enough stock product={} requestedTotal={} available={}",
                            p.getTitle(), nextTotal, p.getStock());
                    throw new IllegalArgumentException("Not enough stock: " + p.getTitle());
                }
            }
            products.put(pid, p);
        }

        PromoCode promo = resolvePromo(cmd.promoCode());

        OrderEntity order = new OrderEntity();
        order.setCustomerName(cmd.customerName());
        order.setPhone(cmd.phone());
        order.setAddress(cmd.address());
        order.setComment(cmd.comment());
        order.setTgUserId(cmd.tgUserId());
        order.setTgUsername(cmd.tgUsername());
        order.setCurrency("UAH");
        if (promo != null) {
            order.setPromoCode(promo.getCode());
        }

        long total = 0;
        for (var item : cmd.items()) {
            var p = products.get(item.productId());
            var variant = resolveVariant(p, item.variantId());

            var oi = new OrderItem();
            oi.setOrder(order);
            oi.setProductId(UuidUtil.toBytes(item.productId()));
            oi.setTitleSnapshot(p.getTitle());
            oi.setPriceMinorSnapshot(p.getPriceMinor());
            if (variant != null) {
                oi.setVariantId(variant.getId());
                oi.setVariantNameSnapshot(variant.getName());
            }
            oi.setQuantity(item.quantity());
            order.getItems().add(oi);

            total += p.getPriceMinor() * (long) item.quantity();
            if (variant != null) {
                variant.setStock(variant.getStock() - item.quantity());
                int totalStock = p.getVariants().stream().mapToInt(ProductVariant::getStock).sum();
                p.setStock(totalStock);
            } else {
                p.setStock(p.getStock() - item.quantity());
            }
        }
        order.setSubtotalMinor(total);

        long discount = 0;
        if (promo != null) {
            if (promo.getDiscountPercent() > 0) {
                discount = Math.max(0, (total * promo.getDiscountPercent()) / 100);
            }
            promo.setUsesCount(promo.getUsesCount() + 1);
            promoCodeRepository.save(promo);
        }
        order.setDiscountMinor(discount);
        order.setTotalMinor(Math.max(0, total - discount));

        var saved = orderRepository.save(order);
        log.info("🧾 ORDER Order persisted uuid={} totalMinor={}", saved.uuid(), saved.getTotalMinor());

        // 1) юзеру — сразу "заказ принят"
        notifyService.notifyUserOrderPlaced(saved);

        // 2) админу — уведомление с кнопками
        notifyService.notifyNewOrder(saved);

        log.info("🧾 ORDER Order notifications dispatched uuid={}", saved.uuid());
        return saved;
    }

    @Transactional
    public OrderEntity approve(UUID uuid) {
        log.info("🧾 ORDER Approving order uuid={}", uuid);
        OrderEntity o = orderRepository.findById(UuidUtil.toBytes(uuid))
                .orElseThrow(() -> {
                    log.warn("🧾 ORDER Approve failed: order not found uuid={}", uuid);
                    return new IllegalArgumentException("Order not found: " + uuid);
                });

        o.setStatus("APPROVED");

        var saved = orderRepository.save(o);

        notifyService.notifyUserOrderStatus(saved, TelegramNotifyService.OrderDecision.APPROVED);
        log.info("🧾 ORDER Order approved uuid={}", saved.uuid());
        return saved;
    }

    @Transactional
    public OrderEntity reject(UUID uuid) {
        return reject(uuid, null);
    }

    @Transactional
    public OrderEntity reject(UUID uuid, String reason) {
        log.info("🧾 ORDER Rejecting order uuid={}", uuid);
        OrderEntity o = orderRepository.findById(UuidUtil.toBytes(uuid))
                .orElseThrow(() -> {
                    log.warn("🧾 ORDER Reject failed: order not found uuid={}", uuid);
                    return new IllegalArgumentException("Order not found: " + uuid);
                });

        o.setStatus("REJECTED");

        // вернуть сток обратно
        o.getItems().forEach(i -> {
            byte[] pid = i.getProductId();
            productRepository.findById(pid).ifPresent(p -> {
                if (i.getVariantId() != null) {
                    var variant = p.getVariants().stream()
                        .filter(v -> java.util.Arrays.equals(v.getId(), i.getVariantId()))
                        .findFirst()
                        .orElse(null);
                    if (variant != null) {
                        variant.setStock(variant.getStock() + i.getQuantity());
                        int totalStock = p.getVariants().stream().mapToInt(ProductVariant::getStock).sum();
                        p.setStock(totalStock);
                        log.debug("🧾 ORDER Restored variant stock product={} variant={} newStock={}",
                            p.getTitle(), variant.getName(), variant.getStock());
                        return;
                    }
                }
                p.setStock(p.getStock() + i.getQuantity());
                log.debug("🧾 ORDER Restored stock product={} newStock={}", p.getTitle(), p.getStock());
            });
        });

        var saved = orderRepository.save(o);

        notifyService.notifyUserOrderRejected(saved, reason);
        log.info("🧾 ORDER Order rejected uuid={}", saved.uuid());
        return saved;
    }

    @Transactional
    public OrderEntity ship(UUID uuid, String trackingNumber) {
        log.info("🧾 ORDER Shipping order uuid={} trackingNumber={}", uuid, trackingNumber);
        OrderEntity o = orderRepository.findById(UuidUtil.toBytes(uuid))
                .orElseThrow(() -> {
                    log.warn("🧾 ORDER Ship failed: order not found uuid={}", uuid);
                    return new IllegalArgumentException("Order not found: " + uuid);
                });

        o.setStatus("SHIPPED");
        o.setTrackingNumber(trackingNumber);

        var saved = orderRepository.save(o);

        notifyService.notifyUserOrderShipped(saved);
        log.info("🧾 ORDER Order shipped uuid={}", saved.uuid());
        return saved;
    }

    public record CreateOrderCommand(
            long tgUserId,
            String tgUsername,
            String customerName,
            String phone,
            String address,
            String comment,
            String promoCode,
            List<Item> items
    ) {}

    public record Item(UUID productId, UUID variantId, int quantity) {}

    private ProductVariant resolveVariant(Product product, UUID variantId) {
        var variants = product.getVariants();
        if (variants == null || variants.isEmpty()) {
            if (variantId != null) {
                throw new IllegalArgumentException("Variant not found for product: " + product.getTitle());
            }
            return null;
        }
        if (variantId == null) {
            log.warn("🧾 ORDER Missing variant for product={}", product.getTitle());
            throw new IllegalArgumentException("Variant required for product: " + product.getTitle());
        }
        return variants.stream()
            .filter(v -> variantId.equals(v.uuid()))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Variant not found for product: " + product.getTitle()));
    }

    private PromoCode resolvePromo(String promoCode) {
        if (promoCode == null || promoCode.isBlank()) return null;
        String normalized = promoCode.trim();
        var promo = promoCodeRepository.findByCodeIgnoreCase(normalized)
            .orElseThrow(() -> new IllegalArgumentException("Promo code not found"));
        if (!promo.isActive()) {
            throw new IllegalArgumentException("Promo code inactive");
        }
        Integer maxUses = promo.getMaxUses();
        if (maxUses != null && promo.getUsesCount() >= maxUses) {
            throw new IllegalArgumentException("Promo code limit reached");
        }
        return promo;
    }
}
