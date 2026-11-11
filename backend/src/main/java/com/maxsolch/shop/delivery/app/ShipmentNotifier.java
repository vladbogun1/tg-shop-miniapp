package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.notification.app.CustomerBot;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

import static com.maxsolch.shop.platform.util.Texts.escHtml;

/**
 * The customer's messages about the parcel (in their language, through the customer bot): it reached the branch or
 * locker (once per waybill, with the money to pay on pickup) and, the day before paid storage starts, one reminder.
 * Each has «Відстежити посилку» and the order chat. The caller marks the waybill so each is sent once.
 */
@Component
public class ShipmentNotifier {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM");

    private final CustomerBot bot;
    private final Messages messages;

    public ShipmentNotifier(CustomerBot bot, Messages messages) {
        this.bot = bot;
        this.messages = messages;
    }

    /** NP 7/8: where it waits, the waybill and — with money to collect — how much to pay on pickup. */
    public void parcelArrived(ShippingOrder order, String ttn, String where, long codMinor) {
        send("NP_ARRIVED", order, ttn, locale -> {
            String text = messages.get(locale, "bot.np.arrived", order.shortId(), escHtml(nz(where)), escHtml(ttn));
            return codMinor > 0 ? text + "\n" + messages.get(locale, "bot.np.arrivedCod", MoneyFormat.uah(codMinor))
                    : text;
        });
    }

    /** Paid storage starts {@code paidFrom}. */
    public void parcelStorage(ShippingOrder order, String ttn, LocalDate paidFrom) {
        String date = paidFrom.format(DAY);
        send("NP_STORAGE", order, ttn,
                locale -> messages.get(locale, "bot.np.storage", order.shortId(), date, escHtml(ttn)));
    }

    private void send(String type, ShippingOrder order, String ttn, Function<Locale, String> textOf) {
        Long tgUserId = order.tgUserId();
        if (ttn == null || !bot.canReach(tgUserId)) {
            return;
        }
        ActivityLog.Entry entry = ActivityLog.Entry.bot(type).toCustomer(tgUserId).order(order.id());
        bot.sendTo(type + " failed for order " + UuidUtil.toString(order.id()), tgUserId, entry,
                locale -> new CustomerBot.Dm(textOf.apply(locale), buttons(order, ttn, locale)));
    }

    private InlineKeyboardMarkup buttons(ShippingOrder order, String ttn, Locale locale) {
        List<List<InlineKeyboardButton>> rows = new ArrayList<>();
        rows.add(List.of(InlineKeyboardButton.builder().text(messages.get(locale, "bot.np.track"))
                .url(ShipmentFacts.TRACKING_URL + URLEncoder.encode(ttn, StandardCharsets.UTF_8)).build()));
        InlineKeyboardMarkup chat = bot.miniAppButton(messages.get(locale, "bot.openChat"),
                "order_" + UuidUtil.toString(order.id()));
        if (chat != null) {
            rows.addAll(chat.getKeyboard());
        }
        return InlineKeyboardMarkup.builder().keyboard(rows).build();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
