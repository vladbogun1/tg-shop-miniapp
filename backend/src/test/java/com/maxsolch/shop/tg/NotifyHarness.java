package com.maxsolch.shop.tg;

import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderSource;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.platform.i18n.CustomerRejectReason;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.platform.settings.SettingsService;
import org.mockito.Mockito;
import org.springframework.context.MessageSource;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.Chat;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.BiConsumer;
import java.util.function.Function;
import java.util.function.Supplier;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

/**
 * Test rig for the Telegram notifications: a real {@link Messages} bundle, a bot that records every
 * call it gets (and answers like Telegram would), and a journal that records every entry. What was
 * sent is rendered to plain text and compared with the files in {@code snapshots/notify}.
 * A missing snapshot is written on the first run (and fails on CI); existing ones are never rewritten.
 */
final class NotifyHarness {

    static final long TG_UK = 101L;
    static final long TG_RU = 102L;
    static final long TG_EN = 103L;
    static final String[] LANGS = {"uk", "ru", "en"};
    static final long[] LANG_IDS = {TG_UK, TG_RU, TG_EN};

    private static final Path SNAPSHOTS = Path.of("src/test/resources/snapshots/notify");

    final AppProperties props = new AppProperties();
    final ShopBot bot = Mockito.mock(ShopBot.class);
    final ActivityLog activity = Mockito.mock(ActivityLog.class);
    final SettingsService settings = Mockito.mock(SettingsService.class);
    final Messages messages;
    final NotificationService service;

    /** Decides whether a Telegram call fails: returns the exception or null. */
    Function<Object, TelegramApiException> failure = call -> null;

    private final List<String> events = java.util.Collections.synchronizedList(new ArrayList<>());
    private final StringBuilder out = new StringBuilder();
    private int nextMessageId = 500;

    NotifyHarness() {
        props.getTelegram().setBotToken("test-token");
        props.getTelegram().setNotifyChatId("-1001234567890");
        props.getTelegram().setNotifyTopicNew(11);
        props.getTelegram().setNotifyTopicProcessing(12);
        props.getTelegram().setNotifyTopicShipped(13);
        props.getTelegram().setNotifyTopicClosed(14);
        props.getTelegram().setNotifyTopicRejected(15);
        props.getTelegram().setNotifyTopicChat(16);
        props.getTelegram().setNotifyTopicDispatch(17);
        props.setWebappBaseUrl("https://app.example.test");
        props.setAdminBaseUrl("https://admin.example.test");

        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("i18n/messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        UserRepository users = Mockito.mock(UserRepository.class);
        for (int i = 0; i < LANGS.length; i++) {
            User u = new User();
            u.setTelegramUserId(LANG_IDS[i]);
            u.setLocale(LANGS[i]);
            Mockito.when(users.findById(LANG_IDS[i])).thenReturn(java.util.Optional.of(u));
        }
        messages = new Messages((MessageSource) source, users);
        Mockito.when(settings.getBool(any())).thenReturn(true);
        service = build(messages, new CustomerRejectReason(messages));
        wire();
    }

    /** The only place that changes when the service constructor does. */
    private NotificationService build(Messages messages, CustomerRejectReason rejectReason) {
        return new NotificationService(props, messages, settings, rejectReason,
                new CustomerBot(bot, props, messages, activity), new SellerChannel(bot, props, activity));
    }

    private void wire() {
        try {
            doAnswer(inv -> {
                SendMessage m = inv.getArgument(0);
                events.add(render(m));
                throwIfFails(m);
                return message(m.getChatId());
            }).when(bot).execute(any(SendMessage.class));
            doAnswer(inv -> {
                EditMessageText m = inv.getArgument(0);
                events.add(render(m));
                throwIfFails(m);
                return Boolean.TRUE;
            }).when(bot).execute(any(EditMessageText.class));
            doAnswer(inv -> {
                DeleteMessage m = inv.getArgument(0);
                events.add(render(m));
                throwIfFails(m);
                return Boolean.TRUE;
            }).when(bot).execute(any(DeleteMessage.class));
            doAnswer(inv -> {
                org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery a = inv.getArgument(0);
                events.add("AnswerCallbackQuery id=" + a.getCallbackQueryId() + " text=" + a.getText());
                return Boolean.TRUE;
            }).when(bot).execute(any(org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery.class));
            doAnswer(inv -> {
                SendDocument d = inv.getArgument(0);
                events.add(render(d));
                throwIfFails(d);
                return message(d.getChatId());
            }).when(bot).sendDocument(any());
            doAnswer(inv -> {
                events.add(render((ActivityLog.Entry) inv.getArgument(0)));
                return ((ActivityLog.BotCall<?>) inv.getArgument(1)).call();
            }).when(activity).bot(any(), any());
            doAnswer(inv -> {
                events.add(render((ActivityLog.Entry) inv.getArgument(0)));
                return null;
            }).when(activity).record(any());
        } catch (TelegramApiException e) {
            throw new IllegalStateException(e);
        }
    }

    private void throwIfFails(Object call) throws TelegramApiException {
        TelegramApiException e = failure.apply(call);
        if (e != null) {
            throw e;
        }
    }

    private Message message(String chatId) {
        Message m = new Message();
        m.setMessageId(nextMessageId++);
        Chat chat = new Chat();
        try {
            chat.setId(Long.parseLong(chatId));
        } catch (NumberFormatException e) {
            chat.setId(-42L);
        }
        m.setChat(chat);
        return m;
    }

    // ---- scenario recording ----

    /** Runs the action and appends everything the bot and the journal saw, plus the order's card ids. */
    <T> T scene(String label, Order order, Supplier<T> action) {
        events.clear();
        T result = action.get();
        out.append("=== ").append(label).append('\n');
        if (result != null) {
            out.append("result: ").append(result).append('\n');
        }
        if (events.isEmpty()) {
            out.append("(nothing sent)\n");
        }
        events.forEach(e -> out.append(e).append('\n'));
        if (order != null) {
            out.append("order: notifyChat=").append(order.getNotifyChatId())
                    .append(" thread=").append(order.getNotifyThreadId())
                    .append(" message=").append(order.getNotifyMessageId())
                    .append(" dispatch=").append(order.getDispatchMessageId()).append('\n');
        }
        out.append('\n');
        return result;
    }

    void record(String event) {
        events.add(event);
    }

    /** Waits (up to 3 s) until the bot and the journal have seen {@code count} events: for async senders. */
    void awaitEvents(int count) {
        long until = System.currentTimeMillis() + 3000;
        while (events.size() < count && System.currentTimeMillis() < until) {
            try {
                Thread.sleep(5);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    void scene(String label, Order order, Runnable action) {
        scene(label, order, () -> {
            action.run();
            return null;
        });
    }

    /** Runs {@code action} for the customer in each of uk / ru / en; the label gets the language prefix. */
    void eachLang(String label, BiConsumer<String, Long> action) {
        for (int i = 0; i < LANGS.length; i++) {
            String l = label.isEmpty() ? LANGS[i] : LANGS[i] + " / " + label;
            action.accept(l, LANG_IDS[i]);
        }
    }

    void assertSnapshot(String name) throws Exception {
        String actual = out.toString().replace("\r\n", "\n");
        Path file = SNAPSHOTS.resolve(name + ".txt");
        if (!Files.exists(file)) {
            if (System.getenv("CI") != null) {
                throw new AssertionError("snapshot missing: " + file);
            }
            Files.createDirectories(SNAPSHOTS);
            Files.writeString(file, actual, StandardCharsets.UTF_8);
            System.out.println("snapshot written: " + file);
            return;
        }
        String expected = Files.readString(file, StandardCharsets.UTF_8).replace("\r\n", "\n");
        org.assertj.core.api.Assertions.assertThat(actual).isEqualTo(expected);
    }

    // ---- rendering ----

    private static String render(SendMessage m) {
        return "SendMessage chat=" + m.getChatId() + " thread=" + m.getMessageThreadId()
                + " parse=" + m.getParseMode() + "\n<<<" + m.getText() + ">>>\nmarkup: " + markup(m.getReplyMarkup());
    }

    private static String render(EditMessageText m) {
        return "EditMessageText chat=" + m.getChatId() + " message=" + m.getMessageId()
                + " parse=" + m.getParseMode() + "\n<<<" + m.getText() + ">>>\nmarkup: " + markup(m.getReplyMarkup());
    }

    private static String render(DeleteMessage m) {
        return "DeleteMessage chat=" + m.getChatId() + " message=" + m.getMessageId();
    }

    private static String render(SendDocument d) {
        int size = -1;
        try {
            size = d.getDocument().getNewMediaStream().readAllBytes().length;
        } catch (Exception ignored) {
            // size is informational only
        }
        return "SendDocument chat=" + d.getChatId() + " file=" + d.getDocument().getMediaName()
                + " bytes=" + size + " parse=" + d.getParseMode()
                + "\n<<<" + d.getCaption() + ">>>\nmarkup: " + markup(d.getReplyMarkup());
    }

    private static String markup(Object markup) {
        if (markup == null) {
            return "none";
        }
        if (!(markup instanceof InlineKeyboardMarkup kb)) {
            return markup.toString();
        }
        StringBuilder sb = new StringBuilder();
        for (List<InlineKeyboardButton> row : kb.getKeyboard()) {
            sb.append('[');
            for (InlineKeyboardButton b : row) {
                sb.append('{').append(b.getText());
                if (b.getUrl() != null) {
                    sb.append(" url=").append(b.getUrl());
                }
                if (b.getWebApp() != null) {
                    sb.append(" webapp=").append(b.getWebApp().getUrl());
                }
                if (b.getCallbackData() != null) {
                    sb.append(" cb=").append(b.getCallbackData());
                }
                sb.append('}');
            }
            sb.append(']');
        }
        return sb.toString();
    }

    private static String render(ActivityLog.Entry e) {
        StringBuilder sb = new StringBuilder("Journal");
        Field[] fields = ActivityLog.Entry.class.getDeclaredFields();
        Arrays.sort(fields, Comparator.comparing(Field::getName));
        for (Field f : fields) {
            if (Modifier.isStatic(f.getModifiers()) || f.getName().equals("at") || f.isSynthetic()) {
                continue;
            }
            try {
                f.setAccessible(true);
                Object v = f.get(e);
                if (v == null) {
                    continue;
                }
                if (v instanceof byte[] b) {
                    v = UuidUtil.toString(b);
                } else if (v instanceof Map<?, ?> map) {
                    v = new TreeMap<>(map);
                }
                sb.append("\n  ").append(f.getName()).append('=').append(v);
            } catch (IllegalAccessException ex) {
                throw new IllegalStateException(ex);
            }
        }
        return sb.toString();
    }

    // ---- fixtures ----

    static Order order(Long tgUserId, OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.toBytes("1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9"));
        o.setTgUserId(tgUserId);
        OrderStates.withStatus(o, status);
        o.setCurrency("₴");
        o.setCustomerName("Іван <Петренко> & Co");
        o.setPhone("+380501234567");
        o.setTgUsername("@ivan_test");
        o.setComment("Передзвоніть <до> 18:00");
        o.setSubtotalMinor(1_070_000);
        o.setDiscountMinor(20_000);
        o.setTotalMinor(1_050_000);
        o.setPaymentOptionTitle("Оплата при отриманні");
        o.setDeliveryMethod(DeliveryMethod.NOVA_POSHTA);
        o.setNpCityName("Київ");
        o.setNpWarehouseName("Відділення №5 <вул. Хрещатик>");
        o.getItems().add(item(o, "Lamzu Atlantis <Mini>", "Black", 459_000, 2, false, false, null));
        o.getItems().add(item(o, "Pulsar Fanatic", null, 152_000, 1, false, false, null));
        o.getItems().add(item(o, "Килимок", "XL", 0, 1, true, false, null));
        o.getItems().add(item(o, "Стікери", null, 0, 3, false, true, "RARE"));
        o.getItems().add(item(o, "Кабель", null, 0, 1, false, true, null));
        return o;
    }

    static OrderItem item(Order o, String title, String variant, long price, int qty, boolean gift,
                          boolean autoGift, String rarity) {
        OrderItem it = new OrderItem();
        it.setOrder(o);
        it.setTitleSnapshot(title);
        it.setVariantNameSnapshot(variant);
        it.setPriceMinorSnapshot(price);
        it.setQuantity(qty);
        it.setGift(gift);
        it.setAutoGift(autoGift);
        it.setCaseRarity(rarity);
        return it;
    }

    static Order pickupOrder(Long tgUserId, OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.toBytes("9f8e7d6c-5b4a-4392-8180-0a1b2c3d4e5f"));
        o.setTgUserId(tgUserId);
        OrderStates.withStatus(o, status);
        o.setSource(OrderSource.WEB);
        o.setCurrency("₴");
        o.setCustomerName("Олена");
        o.setPhone("+380671112233");
        o.setTotalMinor(250_000);
        o.setDeliveryMethod(DeliveryMethod.PICKUP);
        o.getItems().add(item(o, "Скло", null, 250_000, 1, false, false, null));
        return o;
    }
}
