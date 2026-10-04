package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderSource;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderMessage;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.domain.RejectReasonCode;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.tg.NotificationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Order lifecycle and business rules: stock, promo, delivery/payment snapshots, status transitions.
 *
 * <p>Telegram notifications are not sent from here: the service publishes {@link OrderEvents} and
 * {@code OrderNotificationListener} delivers them after the transaction commits, so no database
 * connection or stock row lock is ever held across a network call to Telegram.
 */
@Slf4j
@Service
public class OrderService {

    /** A payment claim repeated after this long counts as a new claim (see {@link #claimPayment}). */
    static final java.time.Duration RECLAIM_AFTER = java.time.Duration.ofMinutes(10);

    /**
     * Error code for "this promo code cannot be used". The cart validates codes before checkout, so
     * reaching this means the last use was taken in the meantime — the app drops the code and lets
     * the customer place the order at the price it then shows, instead of dead-ending them.
     */
    public static final String PROMO_REJECTED = "PROMO_REJECTED";

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final PromoCodeRepository promoCodeRepository;
    private final PaymentOptionRepository paymentOptionRepository;
    private final NotificationService notificationService;
    private final ApplicationEventPublisher events;
    private final PromoService promoService;
    private final CartService cartService;
    private final Messages messages;
    private final EntityManager entityManager;

    public OrderService(OrderRepository orderRepository,
                        ProductRepository productRepository,
                        PromoCodeRepository promoCodeRepository,
                        PaymentOptionRepository paymentOptionRepository,
                        NotificationService notificationService,
                        ApplicationEventPublisher events,
                        PromoService promoService,
                        CartService cartService,
                        Messages messages,
                        EntityManager entityManager) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.promoCodeRepository = promoCodeRepository;
        this.paymentOptionRepository = paymentOptionRepository;
        this.notificationService = notificationService;
        this.events = events;
        this.promoService = promoService;
        this.cartService = cartService;
        this.messages = messages;
        this.entityManager = entityManager;
    }

    /**
     * Validate availability + variants, resolve/apply promo (fixed beats percent), decrement
     * stock (variant + product rollup), snapshot delivery & payment, persist with status NEW,
     * then notify (channel card + optional customer DM).
     */
    @Transactional
    public Order createOrder(CreateOrderCommand cmd) {
        if (cmd.items() == null || cmd.items().isEmpty()) {
            throw new BadRequestException(messages.current("api.order.noItems"));
        }

        DeliveryMethod deliveryMethod = parseDelivery(cmd.deliveryMethod());

        // Accumulate duplicate (productId, variantId) lines into a single requested quantity.
        Map<String, AccLine> acc = new LinkedHashMap<>();
        for (CreateOrderCommand.Line line : cmd.items()) {
            if (line.quantity() <= 0) {
                throw new BadRequestException(messages.current("api.order.quantityPositive"));
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
        order.setSource(cmd.source() == null ? OrderSource.MINIAPP : cmd.source());

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
        // Lock products in a deterministic order (by id): two concurrent orders touching the same
        // pair of products would otherwise be able to deadlock against each other.
        List<AccLine> lines = new ArrayList<>(acc.values());
        lines.sort(Comparator.comparing(l -> l.productId));
        for (AccLine line : lines) {
            // FOR UPDATE: the stock check and the decrement below must not interleave with another
            // checkout, or both orders pass "one left in stock" and the shop oversells.
            Product product = productRepository.findByIdForUpdate(toBytes(line.productId, "productId"))
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
            ProductVariant variant = null;
            if (line.variantId != null && !line.variantId.isBlank()) {
                variant = findVariant(product, line.variantId);
                if (variant == null) {
                    throw new BadRequestException("variant does not belong to product: " + line.variantId);
                }
                item.setVariantId(variant.getId());
                item.setVariantNameSnapshot(variant.getName());
            } else if (hasVariants) {
                throw new BadRequestException("variant is required for product: " + product.getTitle());
            }
            reserveStock(product, variant, line.quantity);

            subtotal += product.getPriceMinor() * (long) line.quantity;
            order.getItems().add(item);
            toSave.add(product);
        }

        // Promo: fixed amount takes priority over percent.
        long discount = 0;
        PromoCode promo = resolvePromo(cmd.promoCode(), cmd.tgUserId(), true);
        if (promo != null) {
            discount = discountFor(promo, subtotal);
            order.setPromoCode(promo.getCode());
            promo.setUsesCount(promo.getUsesCount() + 1);
            promoCodeRepository.save(promo);
            if (cmd.tgUserId() != null) {
                // The use is counted on the code now; leaving the hold in place would block one
                // more use for the rest of the half hour.
                promoService.consume(promo.getId(), cmd.tgUserId());
            }
        }

        order.setSubtotalMinor(subtotal);
        order.setDiscountMinor(discount);
        order.setTotalMinor(Math.max(0, subtotal - discount));

        productRepository.saveAll(toSave);
        Order saved = orderRepository.save(order);

        // The ordered lines leave the customer's server cart in the same transaction, so every
        // device sees them gone at once — and a failed order leaves the cart untouched.
        if (cmd.userId() != null) {
            cartService.removeOrdered(cmd.userId(), saved.getItems().stream()
                    .map(i -> CartRules.LineKey.of(i.getProductId(), i.getVariantId()))
                    .toList());
        }

        // Telegram is contacted only after this transaction commits (see
        // OrderNotificationListener): otherwise the DB connection and the stock row locks stay
        // held for the whole API round trip, and a customer could be told about an order that
        // then failed to save.
        events.publishEvent(new OrderEvents.Created(saved.getId()));
        return saved;
    }

    @Transactional
    public Order approve(byte[] orderId) {
        Order order = lock(orderId);
        if (order.getStatus() != OrderStatus.NEW) {
            throw new BadRequestException("only NEW orders can be approved");
        }
        order.setStatus(OrderStatus.APPROVED);
        order.setApprovedAt(Instant.now());
        // The dispatch card ("К ОТПРАВКЕ") is posted by the status listener after commit.
        return afterTransition(order);
    }

    @Transactional
    public Order ship(byte[] orderId, String trackingNumber) {
        Order order = lock(orderId);
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
        Order order = lock(orderId);
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
        Order order = lock(orderId);
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
        order.setRejectReasonCode(RejectReasonCode.CHANGED_MIND.name());
        return afterTransition(order);
    }

    /**
     * Admin reject/cancel. Allowed from ANY status (incl. DELIVERED — e.g. a customer
     * return at Nova Poshta). {@code restock} controls whether the items go back on the
     * shelf (skip it when the returned goods are not in sellable condition).
     */
    @Transactional
    public Order reject(byte[] orderId, String reason, boolean restock) {
        return reject(orderId, reason, null, restock);
    }

    /**
     * Admin reject with a reason code from the fixed list ({@link RejectReasonCode}) and an
     * optional free-text explanation. Blank text is stored as null, so the customer gets the plain
     * "order rejected" note instead of an empty "Reason:".
     */
    @Transactional
    public Order reject(byte[] orderId, String reason, RejectReasonCode reasonCode, boolean restock) {
        Order order = lock(orderId);
        if (order.getStatus() == OrderStatus.REJECTED) {
            throw new BadRequestException("order already rejected");
        }
        if (restock) {
            restoreStock(order);
        }
        order.setStatus(OrderStatus.REJECTED);
        order.setRejectedAt(Instant.now());
        order.setRejectReason(reason == null || reason.isBlank() ? null : reason.trim());
        order.setRejectReasonCode(reasonCode == null ? null : reasonCode.name());
        return afterTransition(order);
    }

    /** Dispatcher used by the admin board / status PATCH endpoint. */
    @Transactional
    public Order changeStatus(byte[] orderId, OrderStatus target, String trackingNumber,
                              String reason, boolean restock) {
        return changeStatus(orderId, target, trackingNumber, reason, null, restock);
    }

    /** Same, with the structured reject reason. */
    @Transactional
    public Order changeStatus(byte[] orderId, OrderStatus target, String trackingNumber,
                              String reason, RejectReasonCode reasonCode, boolean restock) {
        return switch (target) {
            case APPROVED -> approve(orderId);
            case SHIPPED -> ship(orderId, trackingNumber);
            case DELIVERED -> deliver(orderId);
            case REJECTED -> reject(orderId, reason, reasonCode, restock);
            case NEW -> throw new BadRequestException("cannot transition back to NEW");
        };
    }

    @Transactional(readOnly = true)
    public Order get(byte[] orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("order not found"));
    }

    /**
     * The order, row-locked ({@code SELECT ... FOR UPDATE}) for the rest of the transaction, with
     * its state as of AFTER the lock was granted.
     *
     * <p>The refresh matters: with open-in-view the request's persistence context usually already
     * holds this order (the controller loaded it to check access/existence), and a locking query
     * then hands back that cached instance untouched. Two concurrent rejects would both still see
     * {@code NEW} after waiting for each other's lock — and both return the stock. Refreshing with
     * the lock re-reads the committed row.
     */
    /**
     * Loads the order under a row lock (SELECT … FOR UPDATE) and refreshes it, so concurrent
     * admin / customer actions on one order run one after another. Package-private: also used by
     * {@link OrderAdjustmentService}.
     */
    Order lock(byte[] orderId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new NotFoundException("order not found"));
        entityManager.refresh(order, LockModeType.PESSIMISTIC_WRITE);
        return order;
    }

    /**
     * Sync the seller "К ОТПРАВКЕ" topic with the current APPROVED orders. For each order we
     * reconcile its card with Telegram: missing cards are posted, manually-deleted cards are
     * re-posted, and existing cards are refreshed in place. Idempotent — pressing the button
     * repeatedly never creates duplicates. Returns how many cards were (re)posted.
     *
     * <p>Deliberately NOT one transaction: that held a database connection (and the transaction)
     * open across one Bot API round trip per approved order. The orders are read with their items
     * up front, Telegram is called with no transaction open, and each changed card id is written
     * back on its own in a short update.
     */
    public int broadcastDispatch() {
        List<Order> approved = orderRepository.findWithItemsByStatus(OrderStatus.APPROVED);
        int posted = 0;
        for (Order o : approved) {
            // Detached: open-in-view keeps these managed, and the card id set by Telegram sync
            // would then be flushed as a full-row UPDATE of a possibly stale order (undoing, say,
            // a status change made meanwhile). Only the targeted update below writes it.
            entityManager.detach(o);
            Integer before = o.getDispatchMessageId();
            if (notificationService.syncDispatchCard(o)) {
                posted++;
            }
            if (!Objects.equals(before, o.getDispatchMessageId())) {
                orderRepository.updateDispatchMessageId(o.getId(), o.getDispatchMessageId());
            }
        }
        return posted;
    }

    /**
     * Records the customer's CLAIM that they paid (a transfer screenshot). Deliberately does not
     * touch {@code paid} / {@code receivedMinor}: an uploaded picture is not money in the account,
     * and treating it as such let anyone zero out their cash-on-delivery amount and receive goods
     * for free. Only {@link #markPaid} — admin-only — moves the actual figures.
     */
    @Transactional
    public Order claimPayment(byte[] orderId) {
        Order order = lock(orderId);
        Instant now = Instant.now();
        if (!order.isPaymentClaimed()) {
            order.setPaymentClaimed(true);
            order.setPaymentClaimedAt(now);
        } else if (!order.isPaid() && (order.getPaymentClaimedAt() == null
                || order.getPaymentClaimedAt().plus(RECLAIM_AFTER).isBefore(now))) {
            // A repeated claim later on is a NEW claim (another transfer, a resent screenshot): the
            // fresh time is the inbox row's version, so it comes back on «Внимание» even if snoozed.
            // A double tap within RECLAIM_AFTER stays idempotent.
            order.setPaymentClaimedAt(now);
        }
        Order saved = orderRepository.save(order);
        // The dispatch card must show "заявлена, не подтверждена" so nothing ships as prepaid.
        events.publishEvent(new OrderEvents.PaymentClaimed(saved.getId()));
        return saved;
    }

    /**
     * Sets the amount actually received (admin-only: the payment dialog, or an automatic
     * settlement on delivery). {@code 0} clears the payment.
     */
    @Transactional
    public Order markPaid(byte[] orderId, long receivedMinor) {
        Order order = lock(orderId);
        if (receivedMinor < 0) {
            throw new BadRequestException("сумма не может быть отрицательной");
        }
        if (receivedMinor > order.getTotalMinor()) {
            // Used to be clamped silently: a typo (an extra zero) recorded "paid in full" without
            // the admin noticing the amount they typed was never what got saved.
            throw new BadRequestException("получено больше суммы заказа ("
                    + order.getTotalMinor() / 100 + " " + order.getCurrency() + ")");
        }
        long received = receivedMinor;
        order.setReceivedMinor(received);
        boolean paid = received > 0;
        order.setPaid(paid);
        order.setPaidAt(paid ? Instant.now() : null);
        Order saved = orderRepository.save(order);
        // COD on the seller's card changes with the received amount — keep it in sync.
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    // ----- admin order editing: gifts & discounts -----

    /** Admin adds a FREE gift product to an order: stock is decremented (unit is reserved),
     *  the item is added at price 0 (so total/наложка don't change), gifts merge by product+variant. */
    @Transactional
    public Order addItem(byte[] orderId, String productId, String variantId, int qty,
                         boolean gift, boolean notifyCustomer) {
        Order order = lock(orderId);
        requireEditable(order);
        if (qty < 1) {
            throw new BadRequestException("quantity must be >= 1");
        }
        // Locked: this path mutates stock too (an admin adding a gift reserves real units).
        Product product = productRepository.findByIdForUpdate(toBytes(productId, "productId"))
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
                .filter(i -> i.isGift() == gift)
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
            item.setPriceMinorSnapshot(gift ? 0 : product.getPriceMinor());
            item.setQuantity(qty);
            item.setGift(gift);
            if (variant != null) {
                item.setVariantId(variant.getId());
                item.setVariantNameSnapshot(variant.getName());
            }
            order.getItems().add(item);
        }
        productRepository.save(product);
        recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publishEvent(new OrderEvents.Edited(
                saved.getId(),
                gift ? OrderEvents.EditKind.GIFT : OrderEvents.EditKind.COMPOSITION,
                notifyCustomer,
                product.getTitle(),
                variant == null ? null : variant.getName(),
                qty));
        return saved;
    }

    /** Admin removes an order item (a gift or a line), restoring its stock and recomputing totals. */
    @Transactional
    public Order removeItem(byte[] orderId, long itemId) {
        Order order = lock(orderId);
        requireEditable(order);
        OrderItem item = order.getItems().stream()
                .filter(i -> i.getId() != null && i.getId() == itemId)
                .findFirst()
                .orElseThrow(() -> new NotFoundException("order item not found"));
        restoreItemStock(item);
        order.getItems().remove(item);
        recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    /** Admin changes an item's quantity, reserving/releasing stock by the delta. */
    @Transactional
    public Order changeItemQuantity(byte[] orderId, long itemId, int newQty, boolean notifyCustomer) {
        Order order = lock(orderId);
        requireEditable(order);
        if (newQty < 1) {
            throw new BadRequestException("quantity must be >= 1 (use remove to delete)");
        }
        OrderItem item = order.getItems().stream()
                .filter(i -> i.getId() != null && i.getId() == itemId)
                .findFirst()
                .orElseThrow(() -> new NotFoundException("order item not found"));
        int delta = newQty - item.getQuantity();
        if (delta != 0) {
            Product product = productRepository.findByIdForUpdate(item.getProductId())
                    .orElseThrow(() -> new BadRequestException("product not found"));
            ProductVariant variant = item.getVariantId() == null ? null
                    : findVariant(product, UuidUtil.toString(item.getVariantId()));
            if (delta > 0) {
                reserveStock(product, variant, delta);
            } else {
                releaseStock(product, variant, -delta);
            }
            productRepository.save(product);
        }
        item.setQuantity(newQty);
        recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.of(
                saved.getId(), OrderEvents.EditKind.COMPOSITION, notifyCustomer));
        return saved;
    }

    /** Admin applies / updates / removes a discount: an existing promo code, or a manual amount/percent. */
    @Transactional
    public Order applyDiscount(byte[] orderId, String promoCode, Long amountMinor,
                               Integer percent, boolean clear, boolean notifyCustomer) {
        Order order = lock(orderId);
        requireEditable(order);
        long subtotal = order.getItems().stream()
                .mapToLong(i -> i.getPriceMinorSnapshot() * (long) i.getQuantity()).sum();

        // Release any previous REAL promo usage before re-applying.
        releasePromoUsage(order.getPromoCode());

        long discount = 0;
        if (clear) {
            order.setPromoCode(null);
        } else if (promoCode != null && !promoCode.isBlank()) {
            // An admin applying a code by hand is a deliberate decision, so customers' half-hour
            // holds do not stand in their way — only the code's own usage limit does.
            PromoCode p = resolvePromo(promoCode, null, false);
            discount = discountFor(p, subtotal);
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
        events.publishEvent(OrderEvents.Edited.of(
                saved.getId(), OrderEvents.EditKind.DISCOUNT, notifyCustomer));
        return saved;
    }

    // ----- admin hard delete -----

    /** What was deleted, for the audit line written after the commit. */
    public record DeletedOrder(String customerName, long totalMinor, OrderStatus status,
                               boolean restocked, String promoCode, int attachments) {
    }

    /**
     * Deletes an order for good (cascade: items and chat). Only closed orders — DELIVERED or
     * REJECTED — may go; anything still in progress is a 400, the UI never offered it and the API
     * now agrees.
     *
     * <p>A deleted order must not leave its side effects behind:
     * <ul>
     *   <li>stock — a REJECTED order already settled its stock when it was rejected (restocked or
     *       deliberately not), so only a DELIVERED one returns its units, and only when
     *       {@code restock} is true;</li>
     *   <li>promo usage — rejecting does not give the use back, so it is released here for both;</li>
     *   <li>chat attachments ({@code chat/*}, customers' payment screenshots) and the seller's
     *       dispatch card — removed after the commit (see {@link OrderEvents.Deleted}).</li>
     * </ul>
     */
    @Transactional
    public DeletedOrder delete(byte[] orderId, boolean restock) {
        Order order = lock(orderId);
        OrderStatus status = order.getStatus();
        if (status != OrderStatus.DELIVERED && status != OrderStatus.REJECTED) {
            throw new BadRequestException(
                    "удалить можно только доставленный или отклонённый заказ — сначала отклоните его");
        }
        boolean restocked = status != OrderStatus.REJECTED && restock;
        if (restocked) {
            restoreStock(order);
        }
        releasePromoUsage(order.getPromoCode());

        List<String> attachmentKeys = order.getMessages().stream()
                .map(OrderMessage::getAttachmentUrl)
                .filter(key -> key != null && key.startsWith("chat/"))
                .distinct()
                .toList();
        Integer dispatchMessageId = order.getDispatchMessageId();
        DeletedOrder summary = new DeletedOrder(order.getCustomerName(), order.getTotalMinor(), status,
                restocked, order.getPromoCode(), attachmentKeys.size());

        orderRepository.delete(order);
        events.publishEvent(new OrderEvents.Deleted(order.getId(), dispatchMessageId, attachmentKeys));
        return summary;
    }

    // ----- helpers -----

    /** Order composition/discount may only be edited before dispatch. */
    private void requireEditable(Order order) {
        OrderStatus s = order.getStatus();
        if (s != OrderStatus.NEW && s != OrderStatus.APPROVED) {
            throw new BadRequestException("заказ можно менять только в статусе «Новый» или «Одобрен»");
        }
    }

    /**
     * Reserves {@code qty} units of a product line. The caller must already hold the product row
     * lock ({@link ProductRepository#findByIdForUpdate}).
     *
     * <p>When the product has variants, the variant counters are the source of truth and
     * {@code product.stock} is a pure rollup of them. Keeping it that way (rather than decrementing
     * both independently and clamping at zero) is what stops stock from drifting: the old code lost
     * units on an oversell — {@code Math.max(0, ...)} silently swallowed the difference — and then
     * handed the full quantity back on a cancellation, inventing goods that do not exist.
     */
    private void reserveStock(Product product, ProductVariant variant, int qty) {
        if (variant != null) {
            if (variant.getStock() < qty) {
                throw new BadRequestException("not enough stock for variant: " + variant.getName());
            }
            variant.setStock(variant.getStock() - qty);
            syncRollup(product);
        } else {
            if (product.getStock() < qty) {
                throw new BadRequestException("not enough stock for product: " + product.getTitle());
            }
            product.setStock(product.getStock() - qty);
        }
    }

    /** Returns qty to stock (inverse of reserveStock; product/variant already loaded and locked). */
    private void releaseStock(Product product, ProductVariant variant, int qty) {
        if (variant != null) {
            variant.setStock(variant.getStock() + qty);
            syncRollup(product);
        } else {
            product.setStock(product.getStock() + qty);
        }
    }

    /**
     * Return one item's units to product + variant stock — only the units not already put back by
     * an earlier return ({@link OrderItem#getRestockedQty()}), so nothing is restocked twice.
     */
    private void restoreItemStock(OrderItem item) {
        restockItem(item, item.getQuantity() - item.getRestockedQty());
    }

    /**
     * Puts {@code units} of one order line back on the shelf and records them on the line. Shared
     * with {@link OrderAdjustmentService} (partial returns); the caller runs inside a transaction.
     */
    void restockItem(OrderItem item, int units) {
        if (units <= 0) {
            return;
        }
        productRepository.findByIdForUpdate(item.getProductId()).ifPresent(product -> {
            ProductVariant variant = item.getVariantId() == null ? null
                    : findVariant(product, UuidUtil.toString(item.getVariantId()));
            if (item.getVariantId() != null && variant == null) {
                // The variant was deleted from the catalog after the order was placed: put the
                // units back on the product so they are not lost entirely.
                product.setStock(product.getStock() + units);
            } else {
                releaseStock(product, variant, units);
            }
            productRepository.save(product);
        });
        item.setRestockedQty(Math.min(item.getQuantity(), item.getRestockedQty() + units));
    }

    /** product.stock mirrors the sum of variant stocks whenever the product has variants. */
    private void syncRollup(Product product) {
        if (product.getVariants() == null || product.getVariants().isEmpty()) {
            return;
        }
        int rollup = product.getVariants().stream().mapToInt(ProductVariant::getStock).sum();
        product.setStock(Math.max(0, rollup));
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
        // Locked like the checkout's increment, or the two could overwrite each other's count.
        promoCodeRepository.findByCodeForUpdate(code).ifPresent(p -> {
            if (p.getUsesCount() > 0) {
                p.setUsesCount(p.getUsesCount() - 1);
                promoCodeRepository.save(p);
            }
        });
    }

    /**
     * Persists a status transition and hands the Telegram side to the after-commit listener: it
     * moves the channel card, DMs the customer, and adds or removes the seller's dispatch card
     * depending on whether the order still awaits shipment.
     */
    private Order afterTransition(Order order) {
        Order saved = orderRepository.save(order);
        events.publishEvent(new OrderEvents.StatusChanged(saved.getId()));
        return saved;
    }

    /**
     * Returns every line to stock. Product rows are locked in id order — the same order
     * {@link #createOrder} uses — so a cancellation and a checkout touching the same two products
     * cannot deadlock each other.
     */
    private void restoreStock(Order order) {
        List<OrderItem> items = new ArrayList<>(order.getItems());
        items.sort(Comparator.comparing(i -> UuidUtil.toString(i.getProductId())));
        for (OrderItem item : items) {
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

    /**
     * Resolves an active promo code and takes a row lock on it, so the "usage limit reached" check
     * and the {@code usesCount++} that follows in the caller are atomic with respect to other
     * checkouts. Without the lock a code limited to one use could be redeemed by several
     * simultaneous orders.
     */
    private PromoCode resolvePromo(String code, Long tgUserId, boolean respectHolds) {
        if (code == null || code.isBlank()) {
            return null;
        }
        Optional<PromoCode> opt = promoCodeRepository.findByCodeAndActiveTrueForUpdate(code.trim());
        if (opt.isEmpty()) {
            // Russian, and tagged: this text is shown to the customer, and the app clears the
            // dead code from the cart instead of leaving them stuck on the last step.
            throw new BadRequestException(messages.current("api.promo.rejected"), PROMO_REJECTED);
        }
        PromoCode promo = opt.get();
        // Remaining uses minus other customers' live holds: a code someone reserved from their cart
        // must not be taken by a checkout that merely submitted first.
        long left = respectHolds
                ? promoService.remainingUses(promo, tgUserId)
                : (promo.getMaxUses() == null ? Long.MAX_VALUE : promo.getMaxUses() - promo.getUsesCount());
        if (left <= 0) {
            throw new BadRequestException(messages.current("api.promo.taken"), PROMO_REJECTED);
        }
        return promo;
    }

    /**
     * Discount for a promo code against a subtotal. Fixed amount wins over percent, and both are
     * capped at the subtotal so a misconfigured code (say 150%) can never produce a negative total
     * or a stored discount larger than the order itself.
     */
    public static long discountFor(PromoCode promo, long subtotal) {
        long discount;
        if (promo.getDiscountAmountMinor() > 0) {
            discount = promo.getDiscountAmountMinor();
        } else if (promo.getDiscountPercent() > 0) {
            int percent = Math.min(100, promo.getDiscountPercent());
            discount = subtotal * percent / 100;
        } else {
            discount = 0;
        }
        return Math.min(Math.max(0, discount), subtotal);
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
