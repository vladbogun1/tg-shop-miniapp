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
import org.springframework.stereotype.Service;

@Service
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
        Map<UUID, Product> products = new HashMap<>();

        for (var item : cmd.items()) {
            var pid = item.productId();
            var p = productRepository.findById(UuidUtil.toBytes(pid))
                    .orElseThrow(() -> new IllegalArgumentException("Product not found: " + pid));
            if (!p.isActive()) throw new IllegalArgumentException("Product inactive: " + pid);
            if (p.getStock() < item.quantity()) throw new IllegalArgumentException("Not enough stock: " + p.getTitle());
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

        // 1) юзеру — сразу "заказ принят"
        notifyService.notifyUserOrderPlaced(saved);

        // 2) админу — уведомление с кнопками
        notifyService.notifyNewOrder(saved);

        return saved;
    }

    @Transactional
    public OrderEntity approve(UUID uuid) {
        OrderEntity o = orderRepository.findById(UuidUtil.toBytes(uuid))
                .orElseThrow(() -> new IllegalArgumentException("Order not found: " + uuid));

        // если добавишь статус в OrderEntity — тут ставь APPROVED и проверяй повтор
        // o.setStatus(OrderStatus.APPROVED);

        var saved = orderRepository.save(o);

        notifyService.notifyUserOrderStatus(saved, TelegramNotifyService.OrderDecision.APPROVED);
        return saved;
    }

    @Transactional
    public OrderEntity reject(UUID uuid) {
        OrderEntity o = orderRepository.findById(UuidUtil.toBytes(uuid))
                .orElseThrow(() -> new IllegalArgumentException("Order not found: " + uuid));

        // если добавишь статус в OrderEntity — тут ставь REJECTED и проверяй повтор
        // o.setStatus(OrderStatus.REJECTED);

        // вернуть сток обратно
        o.getItems().forEach(i -> {
            byte[] pid = i.getProductId();
            productRepository.findById(pid).ifPresent(p -> p.setStock(p.getStock() + i.getQuantity()));
        });

        var saved = orderRepository.save(o);

        notifyService.notifyUserOrderStatus(saved, TelegramNotifyService.OrderDecision.REJECTED);
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
