package com.maxsolch.shop.service;

import com.maxsolch.shop.common.MoneyFormat;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderExchange;
import com.maxsolch.shop.domain.OrderExchangeLine;
import com.maxsolch.shop.domain.OrderMoneyMovement;
import com.maxsolch.shop.domain.OrderReturn;
import com.maxsolch.shop.domain.OrderReturnLine;
import com.maxsolch.shop.domain.StockWriteoff;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.repository.OrderExchangeLineRepository;
import com.maxsolch.shop.repository.OrderExchangeRepository;
import com.maxsolch.shop.repository.OrderReturnLineRepository;
import com.maxsolch.shop.repository.OrderReturnRepository;
import com.maxsolch.shop.repository.StockWriteoffRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Admin corrections to an order: fixing the tracking number after shipping, fixing the recipient /
 * delivery address, registering a (partial) return — none of these change the status — and an
 * exchange, which sends the order round again.
 *
 * <p>Each method returns a short Russian description of what changed, for the admin audit log.
 */
@Service
public class OrderAdjustmentService {

    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final ApplicationEventPublisher events;
    private final OrderExchangeRepository exchangeRepository;

    public OrderAdjustmentService(OrderRepository orderRepository,
                                  OrderService orderService,
                                  ApplicationEventPublisher events,
                                  OrderExchangeRepository exchangeRepository) {
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.events = events;
        this.exchangeRepository = exchangeRepository;
    }

    /** Money journal, write-offs, exchange lines (optional: unit tests build the service without them). */
    private MoneyLedger moneyLedger;
    private StockWriteoffRepository writeoffs;
    private OrderExchangeLineRepository exchangeLines;

    @Autowired(required = false)
    void setMoneyLedger(MoneyLedger moneyLedger) {
        this.moneyLedger = moneyLedger;
    }

    @Autowired(required = false)
    void setWriteoffs(StockWriteoffRepository writeoffs) {
        this.writeoffs = writeoffs;
    }

    @Autowired(required = false)
    void setExchangeLines(OrderExchangeLineRepository exchangeLines) {
        this.exchangeLines = exchangeLines;
    }

    /** Return records (V70), so a return or an exchange can be cancelled. */
    private OrderReturnRepository returnRecords;
    private OrderReturnLineRepository returnLines;

    @Autowired(required = false)
    void setReturnRecords(OrderReturnRepository returnRecords, OrderReturnLineRepository returnLines) {
        this.returnRecords = returnRecords;
        this.returnLines = returnLines;
    }

    /** Result of an adjustment: the saved order and the audit line. */
    public record Result(Order order, String auditDetails) {
    }

    // ----- tracking number -----

    /**
     * Replaces the ТТН of a shipped order. Before this existed a typo stayed forever and the
     * customer tracked somebody else's parcel. The customer is told the new number.
     */
    @Transactional
    public Result updateTracking(byte[] orderId, String trackingNumber) {
        Order order = load(orderId);
        if (order.getStatus() != OrderStatus.SHIPPED && order.getStatus() != OrderStatus.DELIVERED) {
            throw new BadRequestException("ТТН можно изменить только у отправленного или доставленного заказа");
        }
        String ttn = trackingNumber == null ? "" : trackingNumber.replaceAll("\\s+", "");
        if (ttn.isEmpty()) {
            throw new BadRequestException("укажите номер ТТН");
        }
        if (ttn.length() > 128) {
            throw new BadRequestException("номер ТТН слишком длинный");
        }
        String old = order.getTrackingNumber();
        if (ttn.equals(old)) {
            return new Result(order, "ТТН не изменилась");
        }
        order.setTrackingNumber(ttn);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.of(saved.getId(), OrderEvents.EditKind.TRACKING, true));
        return new Result(saved, "ТТН: " + (old == null ? "—" : old) + " → " + ttn);
    }

    // ----- recipient & delivery -----

    /** Fields to change; null = leave as is. City and warehouse go together (refs + names). */
    public record DeliveryPatch(String customerName,
                                String phone,
                                String npCityRef,
                                String npCityName,
                                String npWarehouseRef,
                                String npWarehouseName) {
    }

    /**
     * Fixes the recipient's name / phone or the Nova Poshta branch while the parcel can still be
     * re-addressed. Before this the only way out of a customer's typo was to reject and re-create.
     */
    @Transactional
    public Result updateDelivery(byte[] orderId, DeliveryPatch patch) {
        Order order = load(orderId);
        OrderStatus s = order.getStatus();
        if (s != OrderStatus.NEW && s != OrderStatus.APPROVED && s != OrderStatus.SHIPPED) {
            throw new BadRequestException("данные доставки можно менять, пока заказ не доставлен и не отклонён");
        }
        List<String> changes = new ArrayList<>();

        if (patch.customerName() != null) {
            String name = patch.customerName().trim();
            if (name.isEmpty()) {
                throw new BadRequestException("ФИО не может быть пустым");
            }
            if (name.length() > 255) {
                throw new BadRequestException("ФИО слишком длинное");
            }
            if (!name.equals(order.getCustomerName())) {
                changes.add("ФИО: " + order.getCustomerName() + " → " + name);
                order.setCustomerName(name);
            }
        }
        if (patch.phone() != null) {
            String phone = patch.phone().trim();
            if (phone.replaceAll("\\D", "").length() < 10 || phone.length() > 64) {
                throw new BadRequestException("проверьте номер телефона");
            }
            if (!phone.equals(order.getPhone())) {
                changes.add("телефон: " + order.getPhone() + " → " + phone);
                order.setPhone(phone);
            }
        }
        boolean addressGiven = patch.npCityRef() != null || patch.npWarehouseRef() != null
                || patch.npCityName() != null || patch.npWarehouseName() != null;
        if (addressGiven) {
            if (order.getDeliveryMethod() != DeliveryMethod.NOVA_POSHTA) {
                throw new BadRequestException("у заказа самовывоз — отделение не указывается");
            }
            if (isBlank(patch.npCityRef()) || isBlank(patch.npCityName())
                    || isBlank(patch.npWarehouseRef()) || isBlank(patch.npWarehouseName())) {
                throw new BadRequestException("выберите город и отделение Новой Почты");
            }
            if (!Objects.equals(patch.npWarehouseRef().trim(), order.getNpWarehouseRef())
                    || !Objects.equals(patch.npCityRef().trim(), order.getNpCityRef())) {
                changes.add("доставка: " + nz(order.getNpCityName()) + ", " + nz(order.getNpWarehouseName())
                        + " → " + patch.npCityName().trim() + ", " + patch.npWarehouseName().trim());
                order.setNpCityRef(patch.npCityRef().trim());
                order.setNpCityName(patch.npCityName().trim());
                order.setNpWarehouseRef(patch.npWarehouseRef().trim());
                order.setNpWarehouseName(patch.npWarehouseName().trim());
            }
        }
        if (changes.isEmpty()) {
            return new Result(order, "без изменений");
        }
        Order saved = orderRepository.save(order);
        // Refreshes the seller's dispatch card ("К ОТПРАВКЕ") and the channel card.
        events.publishEvent(OrderEvents.Edited.of(saved.getId(), OrderEvents.EditKind.DETAILS, false));
        return new Result(saved, String.join("; ", changes));
    }

    // ----- returns -----

    /**
     * One returned line.
     *
     * @param itemId   order item id
     * @param quantity units the customer sent back now
     * @param restock  put those units back on the shelf (false when not sellable)
     */
    public record ReturnLine(long itemId, int quantity, boolean restock) {
    }

    /**
     * Registers a (partial) return: which units came back, which of them go back to stock, and how
     * much money is refunded. The status is not touched — a fully refused parcel is still an
     * "Отклонить" with reason REFUSED_AT_POST; this is for what happens around and after that.
     *
     * <p>Allowed for SHIPPED / DELIVERED (goods came back) and for REJECTED, where only a refund
     * can be recorded: a rejected order's stock was settled at rejection time. NEW / APPROVED only
     * for money, and only while the customer has paid more than the total (an exchange for
     * something cheaper sends the order back to NEW with the difference still to give back).
     */
    @Transactional
    public Result registerReturn(byte[] orderId, List<ReturnLine> lines, long refundMinor, String note) {
        Order order = load(orderId);
        OrderStatus s = order.getStatus();
        boolean overpaidInWork = (s == OrderStatus.NEW || s == OrderStatus.APPROVED)
                && order.getReceivedMinor() - Math.max(0, order.getRefundedMinor()) > order.getTotalMinor();
        if (s != OrderStatus.SHIPPED && s != OrderStatus.DELIVERED && s != OrderStatus.REJECTED && !overpaidInWork) {
            throw new BadRequestException("возврат оформляется для отправленного, доставленного или отклонённого заказа");
        }
        List<ReturnLine> safeLines = lines == null ? List.of() : lines;
        if ((s == OrderStatus.REJECTED || overpaidInWork) && safeLines.stream().anyMatch(l -> l.quantity() > 0)) {
            throw new BadRequestException(s == OrderStatus.REJECTED
                    ? "по отклонённому заказу можно оформить только возврат денег"
                    : "заказ ещё не отправлен — можно вернуть только переплату");
        }
        if (overpaidInWork && refundMinor > order.getReceivedMinor() - Math.max(0, order.getRefundedMinor())
                - order.getTotalMinor()) {
            throw new BadRequestException("до отправки можно вернуть только переплату: " + MoneyFormat.uah(
                    order.getReceivedMinor() - Math.max(0, order.getRefundedMinor()) - order.getTotalMinor()));
        }
        if (refundMinor < 0) {
            throw new BadRequestException("сумма возврата не может быть отрицательной");
        }
        long refundable = refundableMinor(order);
        if (refundMinor > refundable) {
            throw new BadRequestException("вернуть можно не больше, чем получено: " + MoneyFormat.uah(refundable));
        }

        List<String> parts = new ArrayList<>();
        int units = 0;
        for (ReturnLine line : safeLines) {
            if (line.quantity() <= 0) {
                continue;
            }
            OrderItem item = order.getItems().stream()
                    .filter(i -> i.getId() != null && i.getId() == line.itemId())
                    .findFirst()
                    .orElseThrow(() -> new NotFoundException("order item not found"));
            int left = item.getQuantity() - item.getReturnedQty();
            if (line.quantity() > left) {
                throw new BadRequestException("по позиции «" + item.getTitleSnapshot()
                        + "» можно вернуть не больше " + left + " шт.");
            }
            item.setReturnedQty(item.getReturnedQty() + line.quantity());
            if (line.restock()) {
                // Never more than is still out of stock for this line.
                int canRestock = item.getQuantity() - item.getRestockedQty();
                orderService.restockItem(item, Math.min(line.quantity(), canRestock));
            }
            units += line.quantity();
            parts.add(item.getTitleSnapshot() + " ×" + line.quantity() + (line.restock() ? " (на склад)" : " (не на склад)"));
        }
        if (units == 0 && refundMinor == 0) {
            throw new BadRequestException("укажите, что вернули, или сумму возврата");
        }
        if (refundMinor > 0) {
            order.setRefundedMinor(order.getRefundedMinor() + refundMinor);
            parts.add("возврат денег " + MoneyFormat.uah(refundMinor));
            if (moneyLedger != null) {
                moneyLedger.record(order.getId(), OrderMoneyMovement.Kind.REFUND, OrderMoneyMovement.Channel.OTHER,
                        refundMinor, OrderMoneyMovement.Source.ADMIN, null, note, null);
            }
        }
        order.setReturnedAt(Instant.now());
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        String details = "возврат: " + String.join(", ", parts)
                + (note == null || note.isBlank() ? "" : "; " + note.trim());
        return new Result(saved, details);
    }

    // ----- return wizard (V68) -----

    /** What happens to the returned units of one line. */
    public enum LineOutcome {
        /** Came back sellable: back on the shelf. */
        RESTOCK,
        /** Came back broken: written off (report «Списания»). */
        DEFECT,
        /** The customer keeps the goods (compensation only): the units stay sold. */
        KEPT,
        /**
         * Sent back by post, not here yet: the units count as returned (no longer sold), the order
         * shows in «Едет назад» and «Посылка вернулась» decides shelf or write-off.
         */
        IN_TRANSIT
    }

    /** One line of the wizard. */
    public record WizardLine(long itemId, int quantity, LineOutcome outcome) {
    }

    /** Money given back by hand, not through monobank: Nova Poshta, card transfer, cash… */
    public record ManualRefund(OrderMoneyMovement.Channel channel, long amountMinor, String note) {
    }

    /**
     * The whole return in one go.
     *
     * @param retainMinor   money the shop keeps on purpose (the prepayment that paid for delivery)
     * @param monoRefundMinor what the controller will send back through monobank after this commits;
     *                        only validated here (booked when the bank confirms, never twice)
     */
    public record ReturnPlan(List<WizardLine> lines, List<ManualRefund> refunds, long retainMinor,
                             long monoRefundMinor, String note, boolean notifyCustomer) {
    }

    /**
     * The return wizard: which units came back and in what state, how much money goes back and
     * through which channel, what the shop keeps. Status is not touched (as with
     * {@link #registerReturn}); every amount lands in the money journal; defects in «Списания».
     */
    @Transactional
    public Result registerReturnPlan(byte[] orderId, ReturnPlan plan, String adminName) {
        return registerReturnPlan(orderId, plan, adminName, false);
    }

    /**
     * The wizard's checks without changing anything — run before monobank is asked for the refund,
     * so a refused plan never sends money and a refused refund never leaves half a return behind.
     */
    @Transactional(readOnly = true)
    public void checkReturnPlan(byte[] orderId, ReturnPlan plan) {
        Order order = orderService.get(orderId);
        validatePlan(order, plan, false);
        List<WizardLine> lines = plan.lines() == null ? List.of()
                : plan.lines().stream().filter(l -> l.quantity() > 0).toList();
        for (WizardLine line : lines) {
            OrderItem item = order.getItems().stream()
                    .filter(i -> i.getId() != null && i.getId() == line.itemId())
                    .findFirst()
                    .orElseThrow(() -> new NotFoundException("order item not found"));
            int left = item.getQuantity() - item.getReturnedQty();
            if (line.outcome() != LineOutcome.KEPT && line.quantity() > left) {
                throw new BadRequestException("по позиции «" + item.getTitleSnapshot()
                        + "» можно вернуть не больше " + left + " шт.");
            }
        }
    }

    /**
     * @param monoSent the monobank part was already accepted by the bank (checked by
     *                 {@link #checkReturnPlan} first): it may already be booked as refunded, so it is
     *                 left out of the limit here
     */
    @Transactional
    public Result registerReturnPlan(byte[] orderId, ReturnPlan plan, String adminName, boolean monoSent) {
        Order order = load(orderId);
        validatePlan(order, plan, monoSent);
        OrderStatus s = order.getStatus();
        List<WizardLine> lines = plan.lines() == null ? List.of()
                : plan.lines().stream().filter(l -> l.quantity() > 0).toList();
        List<ManualRefund> refunds = plan.refunds() == null ? List.of()
                : plan.refunds().stream().filter(r -> r.amountMinor() != 0).toList();
        long manual = refunds.stream().mapToLong(ManualRefund::amountMinor).sum();
        String cleanNote = plan.note() == null || plan.note().isBlank() ? null : plan.note().trim();

        List<String> parts = new ArrayList<>();
        List<String> customerParts = new ArrayList<>();
        List<OrderReturnLine> recordLines = new ArrayList<>();
        int units = 0;
        for (WizardLine line : lines) {
            OrderItem item = order.getItems().stream()
                    .filter(i -> i.getId() != null && i.getId() == line.itemId())
                    .findFirst()
                    .orElseThrow(() -> new NotFoundException("order item not found"));
            LineOutcome outcome = line.outcome() == null ? LineOutcome.RESTOCK : line.outcome();
            int left = item.getQuantity() - item.getReturnedQty();
            if (outcome != LineOutcome.KEPT && line.quantity() > left) {
                throw new BadRequestException("по позиции «" + item.getTitleSnapshot()
                        + "» можно вернуть не больше " + left + " шт.");
            }
            String title = item.getTitleSnapshot()
                    + (item.getVariantNameSnapshot() == null ? "" : " (" + item.getVariantNameSnapshot() + ")");
            OrderReturnLine rl = new OrderReturnLine();
            rl.setItemId(item.getId());
            rl.setQuantity(line.quantity());
            rl.setOutcome(outcome.name());
            recordLines.add(rl);
            switch (outcome) {
                case RESTOCK -> {
                    item.setReturnedQty(item.getReturnedQty() + line.quantity());
                    int canRestock = item.getQuantity() - item.getRestockedQty();
                    int restocked = Math.min(line.quantity(), canRestock);
                    orderService.restockItem(item, restocked);
                    rl.setRestockedQty(restocked);
                    parts.add(title + " ×" + line.quantity() + " (на склад)");
                    customerParts.add(title + " ×" + line.quantity());
                }
                case DEFECT -> {
                    item.setReturnedQty(item.getReturnedQty() + line.quantity());
                    StockWriteoff w = writeOff(item, line.quantity(), unitPaidMinor(order, item), order.getId(),
                            cleanNote, adminName);
                    rl.setDefectQty(line.quantity());
                    rl.setWriteoffId(w == null ? null : w.getId());
                    parts.add(title + " ×" + line.quantity() + " (брак, списан)");
                    customerParts.add(title + " ×" + line.quantity());
                }
                case KEPT -> parts.add(title + " ×" + line.quantity() + " (осталось у покупателя, компенсация)");
                case IN_TRANSIT -> {
                    item.setReturnedQty(item.getReturnedQty() + line.quantity());
                    item.setReturnPendingQty(item.getReturnPendingQty() + line.quantity());
                    if (!OrderService.RETURN_IN_TRANSIT.equals(order.getReturnStatus())) {
                        order.setReturnStatus(OrderService.RETURN_IN_TRANSIT);
                        order.setReturnSentAt(Instant.now());
                        order.setReturnReceivedAt(null);
                    }
                    parts.add(title + " ×" + line.quantity() + " (едет назад)");
                    customerParts.add(title + " ×" + line.quantity());
                }
            }
            units += line.quantity();
        }
        if (units == 0 && manual == 0 && plan.monoRefundMinor() == 0 && plan.retainMinor() == 0) {
            throw new BadRequestException("укажите, что вернули, или сумму возврата");
        }
        for (ManualRefund r : refunds) {
            order.setRefundedMinor(order.getRefundedMinor() + r.amountMinor());
            parts.add("возврат " + MoneyFormat.uah(r.amountMinor()) + " (" + channelLabel(r.channel()) + ")");
            if (moneyLedger != null) {
                moneyLedger.record(order.getId(), OrderMoneyMovement.Kind.REFUND, r.channel(), r.amountMinor(),
                        OrderMoneyMovement.Source.ADMIN, adminName, r.note() == null ? cleanNote : r.note(), null);
            }
        }
        if (plan.monoRefundMinor() > 0) {
            parts.add("на карту через monobank " + MoneyFormat.uah(plan.monoRefundMinor()) + " (запрошено)");
        }
        if (plan.retainMinor() > 0) {
            parts.add("удержано " + MoneyFormat.uah(plan.retainMinor()) + " (доставка)");
            if (moneyLedger != null) {
                moneyLedger.record(order.getId(), OrderMoneyMovement.Kind.RETAINED, OrderMoneyMovement.Channel.OTHER,
                        plan.retainMinor(), OrderMoneyMovement.Source.ADMIN, adminName,
                        cleanNote == null ? "удержано: доставка" : cleanNote, null);
            }
        }
        order.setReturnedAt(Instant.now());
        Order saved = orderRepository.save(order);
        if (returnRecords != null) {
            OrderReturn rec = new OrderReturn();
            rec.setOrderId(order.getId());
            rec.setRefundMinor(manual);
            rec.setRefundChannel(refunds.isEmpty() ? null : refunds.get(0).channel().name());
            rec.setMonoRefundMinor(plan.monoRefundMinor());
            rec.setNote(cleanNote == null ? null : cut(cleanNote, 500));
            rec.setAdminName(adminName);
            OrderReturn savedRec = returnRecords.save(rec);
            if (returnLines != null && savedRec != null && savedRec.getId() != null && !recordLines.isEmpty()) {
                recordLines.forEach(l -> l.setReturnId(savedRec.getId()));
                returnLines.saveAll(recordLines);
            }
        }
        long refundedNow = manual + plan.monoRefundMinor();
        events.publishEvent(new OrderEvents.Returned(saved.getId(), plan.notifyCustomer(),
                String.join(", ", customerParts), refundedNow));
        String details = "возврат: " + String.join(", ", parts) + (cleanNote == null ? "" : "; " + cleanNote);
        return new Result(saved, details);
    }

    /** Status, amounts and channels of a wizard plan; nothing is changed. */
    private void validatePlan(Order order, ReturnPlan plan, boolean monoSent) {
        OrderStatus s = order.getStatus();
        boolean overpaidInWork = (s == OrderStatus.NEW || s == OrderStatus.APPROVED)
                && order.getReceivedMinor() - Math.max(0, order.getRefundedMinor()) > order.getTotalMinor();
        if (s != OrderStatus.SHIPPED && s != OrderStatus.DELIVERED && s != OrderStatus.REJECTED && !overpaidInWork) {
            throw new BadRequestException("возврат оформляется для отправленного, доставленного или отклонённого заказа");
        }
        List<WizardLine> lines = plan.lines() == null ? List.of()
                : plan.lines().stream().filter(l -> l.quantity() > 0).toList();
        if (s == OrderStatus.SHIPPED && lines.stream().anyMatch(l -> l.outcome() == LineOutcome.IN_TRANSIT)) {
            throw new BadRequestException("посылка ещё не у покупателя — если её не забрали, отклоните заказ с «Посылка едет назад»");
        }
        if ((s == OrderStatus.REJECTED || overpaidInWork) && !lines.isEmpty()) {
            throw new BadRequestException(s == OrderStatus.REJECTED
                    ? "по отклонённому заказу товар принимается кнопкой «Посылка вернулась», здесь — только деньги"
                    : "заказ ещё не отправлен — можно вернуть только переплату");
        }
        List<ManualRefund> refunds = plan.refunds() == null ? List.of()
                : plan.refunds().stream().filter(r -> r.amountMinor() != 0).toList();
        long manual = 0;
        for (ManualRefund r : refunds) {
            if (r.amountMinor() < 0) {
                throw new BadRequestException("сумма возврата не может быть отрицательной");
            }
            if (r.channel() == null) {
                throw new BadRequestException("укажите, как вернули деньги");
            }
            if (r.channel() == OrderMoneyMovement.Channel.MONO) {
                throw new BadRequestException("возврат на карту через monobank — отдельной строкой «через monobank»");
            }
            manual += r.amountMinor();
        }
        if (plan.retainMinor() < 0 || plan.monoRefundMinor() < 0) {
            throw new BadRequestException("сумма не может быть отрицательной");
        }
        long retainedBefore = moneyLedger == null ? 0 : moneyLedger.retainedMinor(order.getId());
        long refundable = Math.max(0, refundableMinor(order) - retainedBefore);
        long mono = monoSent ? 0 : plan.monoRefundMinor();
        if (manual + mono + plan.retainMinor() > refundable) {
            throw new BadRequestException("вернуть и удержать вместе можно не больше, чем получено и ещё не возвращено"
                    + (retainedBefore > 0 ? " (без уже удержанных " + MoneyFormat.uah(retainedBefore) + ")" : "")
                    + ": " + MoneyFormat.uah(refundable));
        }
        if (overpaidInWork) {
            long over = order.getReceivedMinor() - Math.max(0, order.getRefundedMinor()) - order.getTotalMinor();
            if (manual + mono > over) {
                throw new BadRequestException("до отправки можно вернуть только переплату: " + MoneyFormat.uah(over));
            }
        }
        if (lines.isEmpty() && manual == 0 && plan.monoRefundMinor() == 0 && plan.retainMinor() == 0) {
            throw new BadRequestException("укажите, что вернули, или сумму возврата");
        }
    }

    /** One line of «Посылка вернулась»: units of this order line and what state they came in. */
    public record ReceivedLine(long itemId, int quantity, LineOutcome outcome) {
    }

    /**
     * The parcel is back at the shop ({@code return_status} IN_TRANSIT → RECEIVED): the refused
     * parcel of a rejected order, or the units of a delivered one the wizard sent «едет назад».
     * Sellable units go back on the shelf, broken ones are written off. Lines not listed come back
     * as sellable.
     */
    @Transactional
    public Result receiveReturn(byte[] orderId, List<ReceivedLine> lines, String note, String adminName) {
        Order order = load(orderId);
        if (!OrderService.RETURN_IN_TRANSIT.equals(order.getReturnStatus())) {
            throw new BadRequestException("заказ не ждёт возвращения посылки");
        }
        List<ReceivedLine> given = lines == null ? List.of() : lines;
        String cleanNote = note == null || note.isBlank() ? null : note.trim();
        boolean refused = order.getStatus() == OrderStatus.REJECTED;
        boolean anyPending = order.getItems().stream().anyMatch(i -> i.getReturnPendingQty() > 0);
        List<String> parts = new ArrayList<>();
        for (OrderItem item : order.getItems()) {
            // Units on their way back; a refused parcel from before the per-line count travels whole.
            int out = anyPending ? item.getReturnPendingQty()
                    : refused ? item.getQuantity() - Math.max(item.getReturnedQty(), item.getRestockedQty()) : 0;
            item.setReturnPendingQty(0);
            if (out <= 0) {
                continue;
            }
            int defect = given.stream()
                    .filter(l -> l.itemId() == (item.getId() == null ? -1 : item.getId())
                            && l.outcome() == LineOutcome.DEFECT)
                    .mapToInt(ReceivedLine::quantity).sum();
            defect = Math.max(0, Math.min(defect, out));
            int sellable = out - defect;
            String title = item.getTitleSnapshot()
                    + (item.getVariantNameSnapshot() == null ? "" : " (" + item.getVariantNameSnapshot() + ")");
            int restocked = 0;
            if (sellable > 0) {
                restocked = Math.min(sellable, item.getQuantity() - item.getRestockedQty());
                orderService.restockItem(item, restocked);
                parts.add(title + " ×" + sellable + " (на склад)");
            }
            StockWriteoff w = null;
            if (defect > 0) {
                if (refused) {
                    // A delivered order's returned units were counted when the return was registered.
                    item.setReturnedQty(item.getReturnedQty() + defect);
                }
                w = writeOff(item, defect, unitPaidMinor(order, item), order.getId(), cleanNote, adminName);
                parts.add(title + " ×" + defect + " (брак, списан)");
            }
            settleInTransit(order, item, restocked, defect, w);
        }
        order.setReturnStatus(OrderService.RETURN_RECEIVED);
        order.setReturnReceivedAt(Instant.now());
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        return new Result(saved, "посылка вернулась: " + (parts.isEmpty() ? "без товара" : String.join(", ", parts))
                + (cleanNote == null ? "" : "; " + cleanNote));
    }

    /**
     * What one unit of a line actually cost the customer: its price with the order discount spread
     * over the paid lines in proportion (gifts cost nothing). The wizard's suggested refund.
     */
    public static long unitPaidMinor(Order order, OrderItem item) {
        if (item.isGift() || item.getPriceMinorSnapshot() <= 0) {
            return 0;
        }
        long subtotal = order.getSubtotalMinor();
        long discount = Math.max(0, order.getDiscountMinor());
        if (subtotal <= 0 || discount == 0) {
            return item.getPriceMinorSnapshot();
        }
        double share = Math.min(1.0, (double) discount / subtotal);
        return Math.round(item.getPriceMinorSnapshot() * (1.0 - share));
    }

    private StockWriteoff writeOff(OrderItem item, int quantity, long unitValueMinor, byte[] orderId, String note,
                                   String adminName) {
        if (writeoffs == null || quantity <= 0) {
            return null;
        }
        StockWriteoff w = new StockWriteoff();
        w.setProductId(item.getProductId());
        w.setVariantId(item.getVariantId());
        w.setTitle(cut(item.getTitleSnapshot()
                + (item.getVariantNameSnapshot() == null ? "" : " (" + item.getVariantNameSnapshot() + ")"), 255));
        w.setQuantity(quantity);
        w.setReason(StockWriteoff.Reason.DEFECT.name());
        w.setNote(note == null ? null : cut(note, 500));
        w.setOrderId(orderId);
        w.setUnitValueMinor(unitValueMinor);
        w.setAdminName(adminName);
        return writeoffs.save(w);
    }

    /**
     * «Посылка вернулась» for one line: spreads what was put on the shelf / written off over the
     * return records still waiting for these units, oldest first (V70), so a cancel knows the split.
     */
    private void settleInTransit(Order order, OrderItem item, int restocked, int defect, StockWriteoff w) {
        if (returnRecords == null || returnLines == null || item.getId() == null || restocked + defect <= 0) {
            return;
        }
        List<Long> ids = returnRecords.findByOrderIdOrderByIdAsc(order.getId()).stream()
                .filter(rec -> rec.getCancelledAt() == null).map(OrderReturn::getId).toList();
        if (ids.isEmpty()) {
            return;
        }
        for (OrderReturnLine l : returnLines.findByReturnIdInOrderByIdAsc(ids)) {
            if (l.getItemId() != item.getId() || l.pendingQty() <= 0) {
                continue;
            }
            int take = Math.min(restocked, l.pendingQty());
            l.setRestockedQty(l.getRestockedQty() + take);
            restocked -= take;
            int broken = Math.min(defect, l.pendingQty());
            if (broken > 0) {
                l.setDefectQty(l.getDefectQty() + broken);
                l.setWriteoffId(w == null ? null : w.getId());
                defect -= broken;
            }
            returnLines.save(l);
            if (restocked + defect <= 0) {
                break;
            }
        }
    }

    public static String channelLabel(OrderMoneyMovement.Channel c) {
        return switch (c) {
            case MONO -> "monobank";
            case NP_COD -> "наложка НП";
            case NP_PAYMENT_CONTROL -> "контроль оплаты НП";
            case CARD_TRANSFER -> "перевод на карту";
            case CASH -> "наличные";
            case NP_CLAIM -> "претензия НП";
            case OTHER -> "другое";
            case EXCHANGE -> "зачёт в обмен";
        };
    }

    // ----- exchange -----

    /** One line going out instead of the returned goods. */
    public record ExchangeNewLine(String productId, String variantId, int quantity) {
    }

    /** Where the replacement order of an exchange starts: «Новый» (default) or straight «Одобрен». */
    public static boolean isExchangeTarget(OrderStatus s) {
        return s == OrderStatus.NEW || s == OrderStatus.APPROVED;
    }

    /**
     * Exchange on a delivered order (V69): the delivered order is NOT reopened. It keeps its status,
     * ТТН, delivery date and receipt; the units the customer gives back are registered like any
     * return — on their way by post («Едет назад», accepted later with «Посылка вернулась») or
     * already at the shop (stock / write-off). The goods sent instead form a NEW order linked to
     * this one, shipped with its own ТТН.
     *
     * <p>Money: the paid value of the returned units is moved to the replacement through the money
     * journal (REFUND «зачёт в обмен» here, PAYMENT on the new order, both channel EXCHANGE), so the
     * sale is not counted twice. A dearer replacement leaves the difference to pay on the new order
     * (наложка or online); a cheaper one leaves the rest refundable here, for the return wizard.
     */
    @Transactional
    public Result exchange(byte[] orderId, List<WizardLine> returned, List<ExchangeNewLine> given,
                           OrderStatus target, boolean notifyCustomer, String note, String adminName) {
        Order order = load(orderId);
        if (order.getStatus() != OrderStatus.DELIVERED) {
            throw new BadRequestException(order.getStatus() == OrderStatus.SHIPPED
                    ? "посылка ещё не у покупателя — обмен оформляется после доставки (не забрали — отклоните заказ с «Посылка едет назад»)"
                    : "обмен оформляется для доставленного заказа");
        }
        OrderStatus to = target == null ? OrderStatus.NEW : target;
        if (!isExchangeTarget(to)) {
            throw new BadRequestException("новый заказ обмена начинается с «Новый» или «Одобрен»");
        }
        // No outcome = the unit is sent back by post (the usual case for an exchange).
        List<WizardLine> back = returned == null ? List.of()
                : returned.stream().filter(l -> l.quantity() > 0)
                        .map(l -> l.outcome() == null ? new WizardLine(l.itemId(), l.quantity(), LineOutcome.IN_TRANSIT) : l)
                        .toList();
        List<ExchangeNewLine> out = given == null ? List.of()
                : given.stream().filter(l -> l.quantity() > 0).toList();
        if (back.isEmpty()) {
            throw new BadRequestException("отметьте, что покупатель вернул");
        }
        if (out.isEmpty()) {
            throw new BadRequestException("выберите товар на замену");
        }
        String cleanNote = note == null || note.isBlank() ? null : note.trim();
        if (cleanNote != null && cleanNote.length() > 500) {
            throw new BadRequestException("комментарий длиннее 500 символов");
        }

        // 1. What comes back and what it was paid for (checked again by the return below).
        long credit = 0;
        List<String> backParts = new ArrayList<>();
        List<OrderExchangeLine> backLines = new ArrayList<>();
        for (WizardLine line : back) {
            LineOutcome outcome = line.outcome();
            if (outcome == LineOutcome.KEPT) {
                throw new BadRequestException("при обмене товар возвращается: едет назад, на склад или в брак");
            }
            OrderItem item = order.getItems().stream()
                    .filter(i -> i.getId() != null && i.getId() == line.itemId())
                    .findFirst()
                    .orElseThrow(() -> new NotFoundException("order item not found"));
            int left = item.getQuantity() - item.getReturnedQty();
            if (line.quantity() > left) {
                throw new BadRequestException("по позиции «" + item.getTitleSnapshot()
                        + "» можно обменять не больше " + left + " шт.");
            }
            long unit = unitPaidMinor(order, item);
            credit += unit * line.quantity();
            String title = item.getTitleSnapshot()
                    + (item.getVariantNameSnapshot() == null ? "" : " (" + item.getVariantNameSnapshot() + ")");
            backParts.add(title + " ×" + line.quantity() + switch (outcome) {
                case RESTOCK -> " (на склад)";
                case DEFECT -> " (брак, списан)";
                default -> " (едет назад)";
            });
            OrderExchangeLine el = new OrderExchangeLine();
            el.setProductId(item.getProductId());
            el.setVariantId(item.getVariantId());
            el.setTitle(cut(title, 255));
            el.setQuantity(line.quantity());
            el.setUnitPriceMinor(unit);
            el.setOutcome(outcome.name());
            backLines.add(el);
        }

        // 2. The replacement: a new order of the same customer and address, no gift, no deadline.
        String shortId = shortId(order.getId());
        Order child = orderService.createAdminOrder(new CreateOrderCommand(
                null, order.getTgUserId(), order.getTgUsername(),
                out.stream().map(l -> new CreateOrderCommand.Line(l.productId(), l.variantId(), l.quantity())).toList(),
                order.getCustomerName(), order.getPhone(), null, null,
                order.getDeliveryMethod() == null ? null : order.getDeliveryMethod().name(),
                order.getNpCityRef(), order.getNpCityName(), order.getNpWarehouseRef(), order.getNpWarehouseName(),
                orderService.exchangePaymentOptionId(order), com.maxsolch.shop.domain.OrderSource.ADMIN,
                com.maxsolch.shop.gift.GiftService.CHOICE_NONE), 0, OrderMoneyMovement.Channel.OTHER, adminName, null);
        String childShort = shortId(child.getId());
        long retainedBefore = moneyLedger == null ? 0 : moneyLedger.retainedMinor(order.getId());
        long moved = Math.max(0, Math.min(Math.min(credit, refundableMinor(order) - retainedBefore),
                child.getTotalMinor()));
        if (moved > 0) {
            child = orderService.markPaid(child.getId(), moved, OrderMoneyMovement.Channel.EXCHANGE, adminName,
                    "зачёт по обмену из заказа #" + shortId);
        }
        child.setExchangeOfOrderId(order.getId());
        child.setUserId(order.getUserId());
        // The customer chooses how to pay the difference: online in the order («Доплатити», the whole
        // rest through monobank) or наложкой on delivery. A prepayment snapshot would cap the online part.
        child.setPrepaymentMinor(0);
        if (to == OrderStatus.APPROVED) {
            child.setStatus(OrderStatus.APPROVED);
            child.setApprovedAt(Instant.now());
        }
        child = orderRepository.save(child);

        // 3. This order: the units come back (or are on their way), their paid value moves over.
        List<ManualRefund> refunds = moved > 0
                ? List.of(new ManualRefund(OrderMoneyMovement.Channel.EXCHANGE, moved, "зачёт в обмен, заказ #" + childShort))
                : List.of();
        registerReturnPlan(order.getId(), new ReturnPlan(back, refunds, 0, 0,
                cleanNote == null ? "обмен, новый заказ #" + childShort : cleanNote, false), adminName, false);

        List<String> outParts = child.getItems().stream()
                .map(i -> i.getTitleSnapshot()
                        + (i.getVariantNameSnapshot() == null ? "" : " (" + i.getVariantNameSnapshot() + ")")
                        + " ×" + i.getQuantity())
                .toList();
        OrderExchange ex = new OrderExchange();
        ex.setOrderId(order.getId());
        ex.setNewOrderId(child.getId());
        ex.setPreviousStatus(order.getStatus().name());
        ex.setPreviousTracking(order.getTrackingNumber());
        ex.setReturnedSummary(cut(String.join("; ", backParts), 2000));
        ex.setGivenSummary(cut(String.join("; ", outParts), 2000));
        ex.setTotalBeforeMinor(credit);
        ex.setTotalAfterMinor(child.getTotalMinor());
        ex.setNote(cleanNote);
        ex.setAdminName(adminName);
        OrderExchange savedEx = exchangeRepository.save(ex);
        if (exchangeLines != null && savedEx != null && savedEx.getId() != null) {
            backLines.forEach(l -> l.setExchangeId(savedEx.getId()));
            exchangeLines.saveAll(backLines);
        }
        if (returnRecords != null && savedEx != null) {
            // The return registered above belongs to this exchange: cancelling it cancels the exchange.
            List<OrderReturn> recs = returnRecords.findByOrderIdOrderByIdAsc(order.getId());
            if (!recs.isEmpty()) {
                OrderReturn rec = recs.get(recs.size() - 1);
                rec.setKind(OrderReturn.Kind.EXCHANGE.name());
                rec.setExchangeId(savedEx.getId());
                returnRecords.save(rec);
            }
        }

        events.publishEvent(new OrderEvents.Exchanged(child.getId(), notifyCustomer, String.join(", ", outParts)));

        long due = child.getTotalMinor() - moved;
        long over = credit - moved;
        String details = "обмен: вернули " + String.join(", ", backParts)
                + "; взамен новый заказ #" + childShort + " (" + String.join(", ", outParts) + ") на "
                + MoneyFormat.uah(child.getTotalMinor())
                + "; зачтено " + MoneyFormat.uah(moved)
                + (due > 0 ? "; доплата " + MoneyFormat.uah(due) : "")
                + (over > 0 ? "; к возврату " + MoneyFormat.uah(over) + " (кнопка «Возврат» в заказе #" + shortId + ")" : "")
                + (cleanNote == null ? "" : "; " + cleanNote);
        return new Result(child, details);
    }

    // ----- cancelling a return or an exchange (V70) -----

    /** What happens to the money the cancelled return gave back. */
    public enum CancelMoney {
        /** The customer has already sent it back: booked now. */
        RETURNED,
        /** Not back yet: the order shows the customer's debt until «Деньги пришли». */
        DEBT,
        /** The shop lets the customer keep it. */
        KEEP
    }

    /** All return records of an order, oldest first (empty before V70 or in unit tests). */
    public List<OrderReturn> returnRecordsOf(byte[] orderId) {
        return returnRecords == null ? List.of() : returnRecords.findByOrderIdOrderByIdAsc(orderId);
    }

    public List<OrderReturnLine> returnLinesOf(List<Long> recordIds) {
        return returnLines == null || recordIds.isEmpty() ? List.of() : returnLines.findByReturnIdInOrderByIdAsc(recordIds);
    }

    /**
     * Why the newest return record cannot be cancelled right now, or null. An exchange can only be
     * undone while its replacement has not shipped and holds no money beyond the moved credit.
     */
    public String cancelBlocker(OrderReturn rec, Order replacement) {
        if (rec == null || rec.getCancelledAt() != null) {
            return "уже отменён";
        }
        if (!OrderReturn.Kind.EXCHANGE.name().equals(rec.getKind()) || replacement == null) {
            return null;
        }
        String no = shortId(replacement.getId());
        OrderStatus st = replacement.getStatus();
        if (st == OrderStatus.SHIPPED || st == OrderStatus.DELIVERED) {
            return "замену #" + no + " уже отправили — оформите «Возврат» в заказе #" + no;
        }
        long kept = Math.max(0, replacement.getReceivedMinor()) - Math.max(0, replacement.getRefundedMinor());
        if (kept > rec.getRefundMinor()) {
            return "по замене #" + no + " уже доплатили " + MoneyFormat.uah(kept - rec.getRefundMinor())
                    + " — отклоните заказ #" + no + " и верните эти деньги «Возвратом», потом отмените обмен";
        }
        return null;
    }

    /**
     * The customer changed their mind: the newest return (or exchange) of the order is undone. The
     * units go back into the order (those put on the shelf are taken off it again, write-offs are
     * reversed), the money is booked back / left as the customer's debt / left with them, and an
     * exchange also cancels its replacement order (rejected, its stock released, the moved credit
     * comes back). Nothing is deleted: the record is stamped as cancelled.
     */
    @Transactional
    public Result cancelReturn(byte[] orderId, long returnId, CancelMoney money, String note, String adminName) {
        Order order = load(orderId);
        if (returnRecords == null || returnLines == null) {
            throw new BadRequestException("отмена возврата недоступна");
        }
        String cleanNote = note == null ? "" : note.trim();
        if (cleanNote.length() < 3) {
            throw new BadRequestException("напишите, почему отменяете (хотя бы 3 символа)");
        }
        cleanNote = cut(cleanNote, 500);
        List<OrderReturn> recs = returnRecords.findByOrderIdOrderByIdAsc(order.getId());
        OrderReturn rec = recs.stream().filter(x -> x.getId() != null && x.getId() == returnId).findFirst()
                .orElseThrow(() -> new NotFoundException("возврат не найден"));
        if (rec.getCancelledAt() != null) {
            throw new BadRequestException("этот возврат уже отменён");
        }
        OrderReturn last = recs.stream().filter(x -> x.getCancelledAt() == null).reduce((a, b) -> b).orElse(null);
        if (last != rec) {
            throw new BadRequestException("отменить можно только последний возврат по заказу — сначала отмените более поздний");
        }
        boolean exchange = OrderReturn.Kind.EXCHANGE.name().equals(rec.getKind());
        List<String> parts = new ArrayList<>();
        // A monobank refund the bank has not confirmed yet is not in «возвращено» — never reverse more.
        long given = exchange ? 0
                : Math.min(rec.getRefundMinor() + rec.getMonoRefundMinor(), Math.max(0, order.getRefundedMinor()));
        if (given > 0 && money == null) {
            throw new BadRequestException("скажите, что с деньгами: вернул покупатель, должен или оставляем ему");
        }

        // 1. An exchange: the replacement goes away first, its moved credit comes back here.
        long creditBack = 0;
        if (exchange) {
            OrderExchange ex = rec.getExchangeId() == null ? null : exchangeRepository.findById(rec.getExchangeId()).orElse(null);
            Order child = ex == null || ex.getNewOrderId() == null ? null : orderService.lock(ex.getNewOrderId());
            String blocker = cancelBlocker(rec, child);
            if (blocker != null) {
                throw new BadRequestException(blocker);
            }
            if (child != null) {
                String no = shortId(child.getId());
                long kept = Math.max(0, child.getReceivedMinor()) - Math.max(0, child.getRefundedMinor());
                creditBack = Math.max(0, Math.min(rec.getRefundMinor(), kept));
                if (creditBack > 0) {
                    child.setRefundedMinor(Math.max(0, child.getRefundedMinor()) + creditBack);
                    if (moneyLedger != null) {
                        moneyLedger.record(child.getId(), OrderMoneyMovement.Kind.REFUND, OrderMoneyMovement.Channel.EXCHANGE,
                                creditBack, OrderMoneyMovement.Source.ADMIN, adminName,
                                "обмен отменён, зачёт обратно в заказ #" + shortId(order.getId()), null);
                    }
                }
                orderRepository.save(child);
                if (child.getStatus() != OrderStatus.REJECTED) {
                    orderService.reject(child.getId(), "Обмен отменён", com.maxsolch.shop.domain.RejectReasonCode.OTHER, true);
                }
                parts.add("замена #" + no + " отменена");
            }
            if (ex != null) {
                ex.setCancelledAt(Instant.now());
                ex.setCancelledBy(adminName);
                exchangeRepository.save(ex);
            }
        }

        // 2. The goods: back into the order.
        boolean otherPosted = false;
        List<Long> otherIds = recs.stream().filter(x -> x != rec && x.getCancelledAt() == null).map(OrderReturn::getId).toList();
        if (!otherIds.isEmpty()) {
            otherPosted = returnLines.findByReturnIdInOrderByIdAsc(otherIds).stream()
                    .anyMatch(l -> LineOutcome.IN_TRANSIT.name().equals(l.getOutcome()));
        }
        for (OrderReturnLine l : returnLines.findByReturnIdInOrderByIdAsc(List.of(rec.getId()))) {
            OrderItem item = order.getItems().stream()
                    .filter(i -> i.getId() != null && i.getId() == l.getItemId())
                    .findFirst().orElse(null);
            if (item == null) {
                continue;
            }
            String title = item.getTitleSnapshot()
                    + (item.getVariantNameSnapshot() == null ? "" : " (" + item.getVariantNameSnapshot() + ")");
            if (LineOutcome.KEPT.name().equals(l.getOutcome())) {
                continue;
            }
            int pending = l.pendingQty();
            if (pending > 0) {
                item.setReturnPendingQty(Math.max(0, item.getReturnPendingQty() - pending));
            }
            if (l.getRestockedQty() > 0) {
                orderService.takeBackUnits(item, l.getRestockedQty());
            }
            if (l.getDefectQty() > 0 && writeoffs != null && l.getWriteoffId() != null) {
                writeoffs.findById(l.getWriteoffId()).ifPresent(w -> {
                    w.setUndoneQty(Math.min(w.getQuantity(), w.getUndoneQty() + l.getDefectQty()));
                    w.setUndoneAt(Instant.now());
                    w.setUndoneBy(adminName);
                    w.setUndoneNote("возврат отменён");
                    writeoffs.save(w);
                });
            }
            item.setReturnedQty(Math.max(0, item.getReturnedQty() - l.getQuantity()));
            parts.add(title + " ×" + l.getQuantity() + " снова в заказе");
        }
        boolean anyPending = order.getItems().stream().anyMatch(i -> i.getReturnPendingQty() > 0);
        if (!anyPending && order.getStatus() != OrderStatus.REJECTED) {
            order.setReturnStatus(otherPosted ? OrderService.RETURN_RECEIVED : null);
            if (!otherPosted) {
                order.setReturnSentAt(null);
                order.setReturnReceivedAt(null);
            }
        }
        if (order.getStatus() != OrderStatus.REJECTED && order.getItems().stream().allMatch(i -> i.getReturnedQty() <= 0)) {
            // Nothing is returned any more — the timeline stops saying «Возврат оформлен».
            order.setReturnedAt(null);
        }

        // 3. The money.
        if (exchange) {
            if (creditBack > 0) {
                bookMoneyBack(order, creditBack, OrderMoneyMovement.Channel.EXCHANGE, adminName, "обмен отменён");
            }
        } else if (given > 0) {
            switch (money) {
                case RETURNED -> {
                    bookMoneyBack(order, given, backChannel(rec), adminName, "возврат отменён: деньги вернулись");
                    parts.add("деньги " + MoneyFormat.uah(given) + " вернулись");
                }
                case DEBT -> {
                    rec.setDebtMinor(given);
                    parts.add("покупатель должен вернуть " + MoneyFormat.uah(given));
                }
                case KEEP -> parts.add("деньги " + MoneyFormat.uah(given) + " оставили покупателю");
            }
        }

        rec.setCancelledAt(Instant.now());
        rec.setCancelledBy(adminName);
        rec.setCancelNote(cleanNote);
        returnRecords.save(rec);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        return new Result(saved, (exchange ? "обмен отменён: " : "возврат отменён: ")
                + (parts.isEmpty() ? "без товара" : String.join(", ", parts)) + "; " + cleanNote);
    }

    /** The customer sent back the money of a cancelled return they owed. */
    @Transactional
    public Result settleReturnDebt(byte[] orderId, long returnId, String adminName) {
        Order order = load(orderId);
        OrderReturn rec = returnRecordsOf(order.getId()).stream()
                .filter(x -> x.getId() != null && x.getId() == returnId).findFirst()
                .orElseThrow(() -> new NotFoundException("возврат не найден"));
        if (rec.getDebtMinor() <= 0 || rec.getDebtPaidAt() != null) {
            throw new BadRequestException("по этому возврату покупатель ничего не должен");
        }
        long amount = Math.min(rec.getDebtMinor(), Math.max(0, order.getRefundedMinor()));
        if (amount > 0) {
            bookMoneyBack(order, amount, backChannel(rec), adminName, "долг по отменённому возврату вернули");
        }
        rec.setDebtPaidAt(Instant.now());
        returnRecords.save(rec);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        return new Result(saved, "деньги по отменённому возврату пришли: " + MoneyFormat.uah(amount));
    }

    /**
     * A written-off unit turned out fine (repaired, mis-sorted): back on the shelf. A return's
     * defect becomes a restocked unit of that return, so cancelling it later takes it off the shelf.
     */
    @Transactional
    public String restoreWriteoff(long writeoffId, int quantity, String note, String adminName) {
        if (writeoffs == null) {
            throw new BadRequestException("списания недоступны");
        }
        StockWriteoff w = writeoffs.findById(writeoffId).orElseThrow(() -> new NotFoundException("списание не найдено"));
        int left = w.activeQty();
        if (left <= 0) {
            throw new BadRequestException("по этому списанию всё уже вернули");
        }
        if (quantity < 1 || quantity > left) {
            throw new BadRequestException("вернуть можно от 1 до " + left + " шт.");
        }
        String cleanNote = note == null || note.isBlank() ? null : cut(note.trim(), 500);
        if (w.getOrderId() != null && returnLines != null) {
            Order order = load(w.getOrderId());
            int move = quantity;
            for (OrderReturnLine l : returnLines.findByWriteoffId(w.getId())) {
                int take = Math.min(move, l.getDefectQty());
                if (take <= 0) {
                    continue;
                }
                l.setDefectQty(l.getDefectQty() - take);
                l.setRestockedQty(l.getRestockedQty() + take);
                returnLines.save(l);
                order.getItems().stream().filter(i -> i.getId() != null && i.getId() == l.getItemId()).findFirst()
                        .ifPresent(i -> i.setRestockedQty(Math.min(i.getQuantity(), i.getRestockedQty() + take)));
                move -= take;
                if (move == 0) {
                    break;
                }
            }
            orderRepository.save(order);
        }
        orderService.restockProduct(w.getProductId(), w.getVariantId(), quantity);
        w.setUndoneQty(w.getUndoneQty() + quantity);
        w.setUndoneAt(Instant.now());
        w.setUndoneBy(adminName);
        w.setUndoneNote(cleanNote == null ? "вернули на склад" : cleanNote);
        writeoffs.save(w);
        return "из брака на склад: " + w.getTitle() + " ×" + quantity + (cleanNote == null ? "" : "; " + cleanNote);
    }

    /** Money of a cancelled return came back: «возвращено» goes down, the journal gets a minus refund. */
    private void bookMoneyBack(Order order, long amount, OrderMoneyMovement.Channel channel, String adminName, String note) {
        order.setRefundedMinor(Math.max(0, order.getRefundedMinor() - amount));
        if (moneyLedger != null) {
            moneyLedger.record(order.getId(), OrderMoneyMovement.Kind.REFUND, channel, -amount,
                    OrderMoneyMovement.Source.ADMIN, adminName, note, null);
        }
    }

    /** How the customer sends a refund back: the way it went out; monobank refunds come back by transfer. */
    private static OrderMoneyMovement.Channel backChannel(OrderReturn rec) {
        if (rec.getRefundMinor() > 0 && rec.getRefundChannel() != null) {
            try {
                return OrderMoneyMovement.Channel.valueOf(rec.getRefundChannel());
            } catch (IllegalArgumentException ignored) {
                // fall through
            }
        }
        return OrderMoneyMovement.Channel.CARD_TRANSFER;
    }

    private static String shortId(byte[] id) {
        return com.maxsolch.shop.common.UuidUtil.toString(id).substring(0, 8);
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    /**
     * Money that can still be refunded: what was received minus what was already given back. The
     * raw received amount, not capped at the total: after an exchange for something cheaper the
     * overpayment is exactly what has to go back.
     */
    public static long refundableMinor(Order order) {
        long received = Math.max(0, order.getReceivedMinor());
        return Math.max(0, received - Math.max(0, order.getRefundedMinor()));
    }

    /** Same row lock as every other order change (OrderService), so edits cannot interleave. */
    private Order load(byte[] orderId) {
        return orderService.lock(orderId);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String nz(String s) {
        return s == null ? "—" : s;
    }
}
