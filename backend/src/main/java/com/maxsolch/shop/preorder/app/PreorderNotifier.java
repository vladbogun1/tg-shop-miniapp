package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.translation.app.BotTexts;
import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.procurement.app.BatchDtos.EtaDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.notification.app.CustomerBot;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import com.maxsolch.shop.platform.tx.OnCommitted;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import static com.maxsolch.shop.platform.util.Texts.escHtml;

/**
 * The bot messages of the pre-order queue (stage 4 of docs/PREORDERS-PLAN.md): after commit only, so
 * nobody hears about a hold that was rolled back, and best-effort — a Telegram failure is journaled
 * («Бот и сайт») and never undoes the queue change. Texts are {@code bot.preorder.*} in the customer's
 * language (i18n/messages_*.properties, like the other bot phrases).
 */
@Slf4j
@Component
public class PreorderNotifier {

    private static final DateTimeFormatter HOLD = DateTimeFormatter.ofPattern("HH:mm, dd.MM");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM");

    private final PreorderQueueReader queue;
    private final CustomerBot customer;
    private final BotTexts texts;
    private final java.time.ZoneId zone;

    public PreorderNotifier(PreorderQueueReader queue, CustomerBot customer, BotTexts texts, ShopZone shopZone) {
        this.queue = queue;
        this.customer = customer;
        this.texts = texts;
        this.zone = shopZone.zone();
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onSubscribed(PreorderEvents.Subscribed e) {
        send("PREORDER_SUBSCRIBED", e.subscriptionId(), (d, l) -> {
            MyPreorderDto p = d.place();
            String text = p.eta() == null
                    ? texts.get(l, "bot.preorder.subscribedNotify", title(p))
                    : texts.get(l, "bot.preorder.subscribed", title(p), p.position() == null ? 1 : p.position(),
                            p.qty(), eta(p.eta(), l));
            return new Msg(text, mineButton(l));
        });
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onHoldGranted(PreorderEvents.HoldGranted e) {
        send("PREORDER_HOLD", e.subscriptionId(), (d, l) -> {
            MyPreorderDto p = d.place();
            String text = texts.get(l, "bot.preorder.held", title(p), p.heldQty(), at(p.holdUntil(), HOLD),
                    MoneyFormat.amount(d.priceMinor()));
            if (p.heldQty() < p.qty()) {
                text += texts.get(l, "bot.preorder.heldPartial", p.qty() - p.heldQty());
            }
            return new Msg(text, buyButton(p, l));
        });
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onArrived(PreorderEvents.ArrivedNotice e) {
        send("PREORDER_ARRIVED", e.subscriptionId(),
                (d, l) -> new Msg(texts.get(l, "bot.preorder.arrived", title(d.place())), buyButton(d.place(), l)));
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onHoldEnding(PreorderEvents.HoldEnding e) {
        send("PREORDER_HOLD_ENDING", e.subscriptionId(), (d, l) -> new Msg(
                texts.get(l, "bot.preorder.ending", title(d.place()), at(d.place().holdUntil(), TIME)),
                buyButton(d.place(), l)));
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onHoldExpired(PreorderEvents.HoldExpired e) {
        send("PREORDER_HOLD_EXPIRED", e.subscriptionId(),
                (d, l) -> new Msg(texts.get(l, "bot.preorder.expired", title(d.place())), mineButton(l)));
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onStillWaiting(PreorderEvents.StillWaiting e) {
        send("PREORDER_STILL_WAITING", e.subscriptionId(), (d, l) -> new Msg(
                texts.get(l, "bot.preorder.stillWaiting", title(d.place()), e.position()), mineButton(l)));
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onClosed(PreorderEvents.Closed e) {
        String key = switch (e.reason() == null ? "" : e.reason()) {
            case "BATCH_CANCELLED" -> "bot.preorder.batchCancelled";
            case "PRODUCT_GONE" -> "bot.preorder.productGone";
            default -> "bot.preorder.removed";
        };
        send("PREORDER_CLOSED", e.subscriptionId(),
                (d, l) -> new Msg(texts.get(l, key, title(d.place())), mineButton(l)));
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onBatchCancelledKept(PreorderEvents.BatchCancelledKept e) {
        send("PREORDER_BATCH_CANCELLED", e.subscriptionId(), (d, l) -> new Msg(
                texts.get(l, "bot.preorder.batchCancelledKept", title(d.place())), mineButton(l)));
    }

    // ----- helpers -----

    private record Msg(String text, InlineKeyboardMarkup buttons) {
    }

    private interface Builder {
        Msg build(PreorderQueueReader.Described d, Locale locale);
    }

    private void send(String type, long subscriptionId, Builder builder) {
        if (!customer.enabled()) {
            return;
        }
        try {
            Long userId = queue.ownerOf(subscriptionId);
            customer.sendTo(type + " not delivered for place " + subscriptionId, userId,
                    ActivityLog.Entry.bot(type).toCustomer(userId),
                    locale -> queue.describe(subscriptionId, locale)
                            .map(d -> {
                                Msg m = builder.build(d, locale);
                                return new CustomerBot.Dm(m.text(), m.buttons());
                            })
                            .orElse(null));
        } catch (RuntimeException ex) {
            log.warn("{} failed for place {}: {}", type, subscriptionId, ex.toString());
        }
    }

    private static String title(MyPreorderDto p) {
        String t = p.productTitle() == null ? "" : p.productTitle();
        if (p.variantName() != null && !p.variantName().isBlank()) {
            t += " (" + p.variantName() + ")";
        }
        return "<b>" + escHtml(t) + "</b>";
    }

    /** «Очікуємо: 10.11 – 20.11\n», or empty when the shop keeps the date to itself. */
    private String eta(EtaDto eta, Locale l) {
        if (eta == null || "HIDDEN".equals(eta.mode())) {
            return "";
        }
        String when = switch (eta.mode()) {
            case "DATE" -> eta.from() == null ? null : day(eta.from());
            case "RANGE" -> eta.from() == null || eta.to() == null ? null : day(eta.from()) + " – " + day(eta.to());
            case "APPROX" -> eta.approxWeeks() == null || eta.approxWeeks() <= 0
                    ? texts.get(l, "bot.preorder.soon")
                    : texts.get(l, "bot.preorder.approxWeeks", eta.approxWeeks());
            default -> null;
        };
        return when == null ? "" : texts.get(l, "bot.preorder.eta", when);
    }

    private static String day(LocalDate d) {
        return d.format(DAY);
    }

    private String at(Instant t, DateTimeFormatter f) {
        return t == null ? "" : t.atZone(zone).format(f);
    }

    private InlineKeyboardMarkup buyButton(MyPreorderDto p, Locale l) {
        return button(l, "bot.preorder.btnBuy", "pp_" + p.productId());
    }

    private InlineKeyboardMarkup mineButton(Locale l) {
        return button(l, "bot.preorder.btnMine", "preorders");
    }

    private InlineKeyboardMarkup button(Locale l, String label, String startApp) {
        return customer.miniAppButton(texts.get(l, label), startApp);
    }
}
