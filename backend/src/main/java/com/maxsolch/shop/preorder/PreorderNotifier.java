package com.maxsolch.shop.preorder;

import com.maxsolch.shop.common.MoneyFormat;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.i18n.BotTexts;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.preorder.PreorderDtos.EtaDto;
import com.maxsolch.shop.preorder.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.tg.ShopBot;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

import static com.maxsolch.shop.common.Texts.escHtml;

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

    private final PreorderQueueService queue;
    private final ShopBot bot;
    private final AppProperties props;
    private final Messages messages;
    private final BotTexts texts;
    private final ActivityLog activity;

    public PreorderNotifier(PreorderQueueService queue, @Lazy ShopBot bot, AppProperties props, Messages messages,
                            ActivityLog activity, BotTexts texts) {
        this.queue = queue;
        this.bot = bot;
        this.props = props;
        this.messages = messages;
        this.texts = texts;
        this.activity = activity;
    }

    @TransactionalEventListener(fallbackExecution = true)
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

    @TransactionalEventListener(fallbackExecution = true)
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

    @TransactionalEventListener(fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onArrived(PreorderEvents.ArrivedNotice e) {
        send("PREORDER_ARRIVED", e.subscriptionId(),
                (d, l) -> new Msg(texts.get(l, "bot.preorder.arrived", title(d.place())), buyButton(d.place(), l)));
    }

    @TransactionalEventListener(fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onHoldEnding(PreorderEvents.HoldEnding e) {
        send("PREORDER_HOLD_ENDING", e.subscriptionId(), (d, l) -> new Msg(
                texts.get(l, "bot.preorder.ending", title(d.place()), at(d.place().holdUntil(), TIME)),
                buyButton(d.place(), l)));
    }

    @TransactionalEventListener(fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onHoldExpired(PreorderEvents.HoldExpired e) {
        send("PREORDER_HOLD_EXPIRED", e.subscriptionId(),
                (d, l) -> new Msg(texts.get(l, "bot.preorder.expired", title(d.place())), mineButton(l)));
    }

    @TransactionalEventListener(fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onStillWaiting(PreorderEvents.StillWaiting e) {
        send("PREORDER_STILL_WAITING", e.subscriptionId(), (d, l) -> new Msg(
                texts.get(l, "bot.preorder.stillWaiting", title(d.place()), e.position()), mineButton(l)));
    }

    @TransactionalEventListener(fallbackExecution = true)
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

    @TransactionalEventListener(fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onBatchCancelledKept(PreorderEvents.BatchCancelledKept e) {
        send("PREORDER_BATCH_CANCELLED", e.subscriptionId(), (d, l) -> new Msg(
                texts.get(l, "bot.preorder.batchCancelledKept", title(d.place())), mineButton(l)));
    }

    // ----- helpers -----

    private record Msg(String text, InlineKeyboardMarkup buttons) {
    }

    private interface Builder {
        Msg build(PreorderQueueService.Described d, Locale locale);
    }

    private void send(String type, long subscriptionId, Builder builder) {
        if (!enabled()) {
            return;
        }
        try {
            Long userId = queue.ownerOf(subscriptionId);
            if (userId == null || userId <= 0) {
                return;
            }
            Locale locale = messages.localeOf(userId);
            queue.describe(subscriptionId, locale).ifPresent(d -> {
                Msg m = builder.build(d, locale);
                SendMessage msg = SendMessage.builder()
                        .chatId(String.valueOf(d.userId()))
                        .text(m.text())
                        .parseMode("HTML")
                        .replyMarkup(m.buttons())
                        .build();
                try {
                    activity.bot(ActivityLog.Entry.bot(type).toCustomer(d.userId()).text(m.text()),
                            () -> bot.execute(msg));
                } catch (Exception ex) {
                    log.warn("{} not delivered for place {}: {}", type, subscriptionId, ex.getMessage());
                }
            });
        } catch (RuntimeException ex) {
            log.warn("{} failed for place {}: {}", type, subscriptionId, ex.toString());
        }
    }

    private boolean enabled() {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
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

    private static String at(Instant t, DateTimeFormatter f) {
        return t == null ? "" : t.atZone(PreorderQueueService.KYIV).format(f);
    }

    /** Telegram only takes HTTPS web-app buttons (local http://localhost is rejected). */
    private String webapp() {
        String url = props.getWebappBaseUrl();
        return url != null && url.startsWith("https://") ? url : null;
    }

    private InlineKeyboardMarkup buyButton(MyPreorderDto p, Locale l) {
        return button(l, "bot.preorder.btnBuy", "pp_" + p.productId());
    }

    private InlineKeyboardMarkup mineButton(Locale l) {
        return button(l, "bot.preorder.btnMine", "preorders");
    }

    private InlineKeyboardMarkup button(Locale l, String label, String startApp) {
        String base = webapp();
        if (base == null) {
            return null;
        }
        InlineKeyboardButton b = InlineKeyboardButton.builder()
                .text(texts.get(l, label))
                .webApp(WebAppInfo.builder().url(base + "?startapp=" + startApp).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(b))).build();
    }
}
