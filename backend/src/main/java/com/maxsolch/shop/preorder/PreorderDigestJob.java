package com.maxsolch.shop.preorder;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.tg.ShopBot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.platform.util.Texts.escHtml;

/**
 * «Чего ждут за сутки»: once a day at 10:00 Kyiv time the admins' chat gets the new waiting-list entries of
 * the last 24 hours and the three most wanted products. Nothing is sent when nobody joined, and nothing when
 * the bot or the chat is not configured (local stand). A restart at 10:00 cannot send it twice: the day is
 * remembered in {@code system.preorderDigestDay}.
 */
@Component
public class PreorderDigestJob {

    private static final Logger log = LoggerFactory.getLogger(PreorderDigestJob.class);
    static final String DAY_KEY = "preorderDigestDay";
    static final int TOP = 3;

    private final PreorderSubscriptionRepository subs;
    private final PreorderQueueService queue;
    private final SettingsService settings;
    private final AppProperties props;
    private final ShopBot bot;
    private final ActivityLog activity;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public PreorderDigestJob(PreorderSubscriptionRepository subs, PreorderQueueService queue,
                             SettingsService settings, AppProperties props, @Lazy ShopBot bot, ActivityLog activity) {
        this(subs, queue, settings, props, bot, activity, Clock.systemUTC());
    }

    PreorderDigestJob(PreorderSubscriptionRepository subs, PreorderQueueService queue, SettingsService settings,
                      AppProperties props, ShopBot bot, ActivityLog activity, Clock clock) {
        this.subs = subs;
        this.queue = queue;
        this.settings = settings;
        this.props = props;
        this.bot = bot;
        this.activity = activity;
        this.clock = clock;
    }

    @Scheduled(cron = "0 0 10 * * *", zone = "Europe/Kyiv")
    public void daily() {
        try {
            send();
        } catch (RuntimeException e) {
            log.warn("Preorder digest failed: {}", e.toString());
        }
    }

    /** @return true when a message went out. */
    boolean send() {
        String token = props.getTelegram().getBotToken();
        String chatId = props.getTelegram().getNotifyChatId();
        if (token == null || token.isBlank() || chatId == null || chatId.isBlank() || "0".equals(chatId.trim())) {
            return false;
        }
        LocalDate today = LocalDate.now(clock.withZone(PreorderQueueService.KYIV));
        if (settings.system(DAY_KEY).map(today.toString()::equals).orElse(false)) {
            return false;
        }
        Instant to = clock.instant();
        String text = text(to.minus(Duration.ofDays(1)), to);
        if (text == null) {
            return false;
        }
        settings.putSystem(DAY_KEY, today.toString());
        SendMessage msg = SendMessage.builder().chatId(chatId).text(text).parseMode("HTML").build();
        int topic = props.getTelegram().getNotifyTopicChat();
        if (topic > 0) {
            msg.setMessageThreadId(topic);
        }
        try {
            activity.bot(ActivityLog.Entry.bot("ADMIN_PREORDER_DIGEST").toAdmins(chatId).text(text),
                    () -> bot.execute(msg));
        } catch (Exception e) {
            log.warn("Preorder digest not delivered: {}", e.getMessage());
        }
        return true;
    }

    /** The digest text, or null when nobody joined in [from, to). */
    String text(Instant from, Instant to) {
        Object[] total = subs.joinedBetween(from, to).stream().findFirst().orElse(new Object[]{0L, 0L});
        long count = ((Number) total[0]).longValue();
        long people = ((Number) total[1]).longValue();
        if (count <= 0) {
            return null;
        }
        List<Object[]> rows = subs.joinedByProduct(from, to);
        List<byte[]> top = new ArrayList<>();
        for (Object[] r : rows.subList(0, Math.min(TOP, rows.size()))) {
            top.add((byte[]) r[0]);
        }
        Map<String, Product> byId = queue.productsOf(top);
        List<String> parts = new ArrayList<>();
        for (int i = 0; i < top.size(); i++) {
            Product p = byId.get(UuidUtil.toString(top.get(i)));
            if (p != null) {
                parts.add("<b>" + escHtml(p.getTitle()) + "</b> (+" + ((Number) rows.get(i)[1]).longValue() + ")");
            }
        }
        return "🔔 Чего ждут за сутки: +" + count + " " + plural(count) + " (" + people + " чел.)"
                + (parts.isEmpty() ? "" : " · топ: " + String.join(", ", parts));
    }

    private static String plural(long n) {
        long m100 = n % 100;
        long m10 = n % 10;
        if (m100 >= 11 && m100 <= 14) {
            return "подписок";
        }
        return m10 == 1 ? "подписка" : m10 >= 2 && m10 <= 4 ? "подписки" : "подписок";
    }
}
