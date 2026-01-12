package com.example.tgshop.order;

import com.example.tgshop.common.UuidUtil;
import com.example.tgshop.product.Product;
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
    private final TelegramNotifyService notifyService;

    public OrderService(
            ProductRepository productRepository,
            OrderRepository orderRepository,
            TelegramNotifyService notifyService
    ) {
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
        this.notifyService = notifyService;
    }

    @Transactional
    public OrderEntity createOrder(CreateOrderCommand cmd) {
        log.info("🧾 ORDER Creating order for tgUserId={} items={}", cmd.tgUserId(), cmd.items().size());
        Map<UUID, Product> products = new HashMap<>();

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
            if (p.getStock() < item.quantity()) {
                log.warn("🧾 ORDER Order rejected: not enough stock product={} requested={} available={}",
                        p.getTitle(), item.quantity(), p.getStock());
                throw new IllegalArgumentException("Not enough stock: " + p.getTitle());
            }
            products.put(pid, p);
        }

        OrderEntity order = new OrderEntity();
        order.setCustomerName(cmd.customerName());
        order.setPhone(cmd.phone());
        order.setAddress(cmd.address());
        order.setComment(cmd.comment());
        order.setTgUserId(cmd.tgUserId());
        order.setTgUsername(cmd.tgUsername());
        order.setCurrency("UAH");

        long total = 0;
        for (var item : cmd.items()) {
            var p = products.get(item.productId());

            var oi = new OrderItem();
            oi.setOrder(order);
            oi.setProductId(UuidUtil.toBytes(item.productId()));
            oi.setTitleSnapshot(p.getTitle());
            oi.setPriceMinorSnapshot(p.getPriceMinor());
            oi.setQuantity(item.quantity());
            order.getItems().add(oi);

            total += p.getPriceMinor() * (long) item.quantity();
            p.setStock(p.getStock() - item.quantity());
        }
        order.setTotalMinor(total);

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
            List<Item> items
    ) {}

    public record Item(UUID productId, int quantity) {}
}
