package com.maxsolch.shop.tg;

import com.maxsolch.shop.adminauth.AdminInvite;
import com.maxsolch.shop.adminauth.AdminSecurityAlerts;
import com.maxsolch.shop.adminauth.AdminTeamMessenger;
import com.maxsolch.shop.adminauth.AdminSessions;
import com.maxsolch.shop.adminauth.LoginMethod;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.repository.AdminUserRepository;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.CallbackQuery;
import org.telegram.telegrambots.meta.api.objects.MaybeInaccessibleMessage;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Personal Telegram alerts about an admin's own account, from the shop bot:
 * <ul>
 *   <li>a sign-in from a new device — «Вход в админку: Київ, Windows · Chrome, 09:12. Это не вы?»;</li>
 *   <li>the account locked after wrong passwords / codes.</li>
 * </ul>
 * Both carry [Заблокировать] ({@value #BLOCK_PREFIX}{@code <adminId>}): only that admin can press it,
 * and it ends every session, half-finished sign-in and trusted device of the account
 * ({@link AdminSessions#revokeEverything}). Sent off the request thread; with no bot token the
 * alerts are skipped silently — the sign-in never depends on Telegram.
 *
 * <p>Stage 2 ({@link AdminTeamMessenger}): the invite link with a button (sent synchronously — the
 * super admin is shown the link instead when it fails) and notices about a 2FA / password reset or
 * a block done by the super admin.
 */
@Slf4j
@Component
public class AdminSecurityNotifier implements AdminSecurityAlerts, AdminTeamMessenger {

    static final String BLOCK_PREFIX = "asb:";
    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("dd.MM HH:mm");

    private final ShopBot bot;
    private final AppProperties props;
    private final AdminSessions sessions;
    private final AdminUserRepository adminUserRepository;
    private final AdminAuditService audit;
    private final ZoneId zone;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "admin-security-alerts");
        t.setDaemon(true);
        return t;
    });

    public AdminSecurityNotifier(@Lazy ShopBot bot, AppProperties props, @Lazy AdminSessions sessions,
                                 AdminUserRepository adminUserRepository, AdminAuditService audit) {
        this.bot = bot;
        this.props = props;
        this.sessions = sessions;
        this.adminUserRepository = adminUserRepository;
        this.audit = audit;
        this.zone = ZoneId.of(props.getTimezone());
    }

    public static boolean handles(String callbackData) {
        return callbackData != null && callbackData.startsWith(BLOCK_PREFIX);
    }

    @Override
    public void newDeviceLogin(long adminId, LoginMethod method, String place, String device, String ip, Instant at) {
        String text = "🔐 <b>Вход в админку</b>: " + esc(place) + ", " + esc(device) + ", " + time(at) + "\n"
                + "Способ: " + esc(method.label()) + ", IP " + esc(ip) + "\n\n"
                + "Это не вы? Нажмите «Заблокировать» — все сессии и доверенные устройства будут завершены.";
        send(adminId, text);
    }

    @Override
    public void accountLocked(long adminId, String place, String device, String ip, Instant until) {
        String text = "⛔ <b>Вход в админку заблокирован до " + time(until) + "</b>\n"
                + "5 неверных паролей или кодов подряд. Последняя попытка: " + esc(place) + ", " + esc(device)
                + ", IP " + esc(ip) + "\n\n"
                + "Если это не вы — нажмите «Заблокировать» и смените пароль.";
        send(adminId, text);
    }

    @Override
    public boolean sendInvite(long telegramUserId, String link, AdminInvite.Kind kind, String roleLabel,
                              String inviterName, Instant expiresAt) {
        if (!enabled() || telegramUserId <= 0 || link == null) {
            return false;
        }
        String what = switch (kind) {
            case NEW -> "🔑 <b>Вас пригласили в админку ChiSetup</b> (роль: " + esc(roleLabel) + ").\n"
                    + "Пригласил: " + esc(inviterName) + ".\n\n"
                    + "Нажмите кнопку, придумайте логин и пароль и подключите приложение-аутентификатор "
                    + "(Google Authenticator, 1Password, Authy).";
            case CREDENTIALS -> "🔑 <b>Вход в админку ChiSetup по логину и паролю</b>\n"
                    + esc(inviterName) + " выдал вам логин. Нажмите кнопку, придумайте логин и пароль"
                    + " (и подключите приложение-аутентификатор, если ещё не подключено).";
            case PASSWORD_RESET -> "🔑 <b>Пароль от админки ChiSetup сброшен</b> главным админом.\n"
                    + "Старый пароль больше не действует, все сессии завершены. Нажмите кнопку и задайте новый.";
        };
        String text = what + "\n\nСсылка одноразовая, действует до " + DAY_TIME.format(expiresAt.atZone(zone))
                + ". Никому её не пересылайте.";
        try {
            bot.execute(SendMessage.builder()
                    .chatId(String.valueOf(telegramUserId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(InlineKeyboardMarkup.builder()
                            .keyboard(List.of(List.of(InlineKeyboardButton.builder()
                                    .text(kind == AdminInvite.Kind.PASSWORD_RESET ? "Задать новый пароль" : "Открыть приглашение")
                                    .url(link)
                                    .build())))
                            .build())
                    .build());
            return true;
        } catch (Exception e) {
            log.info("Admin invite to {} not delivered: {}", telegramUserId, e.getMessage());
            return false;
        }
    }

    @Override
    public void accountNotice(long adminId, String html) {
        if (!enabled() || adminId <= 0) {
            return;
        }
        executor.execute(() -> {
            try {
                bot.execute(SendMessage.builder().chatId(String.valueOf(adminId)).text(html).parseMode("HTML").build());
            } catch (Exception e) {
                log.info("Admin account notice to {} not delivered: {}", adminId, e.getMessage());
            }
        });
    }

    private void send(long adminId, String text) {
        if (!enabled() || adminId <= 0) {
            return;
        }
        executor.execute(() -> {
            try {
                bot.execute(SendMessage.builder()
                        .chatId(String.valueOf(adminId))
                        .text(text)
                        .parseMode("HTML")
                        .replyMarkup(InlineKeyboardMarkup.builder()
                                .keyboard(List.of(List.of(InlineKeyboardButton.builder()
                                        .text("🚫 Заблокировать")
                                        .callbackData(BLOCK_PREFIX + adminId)
                                        .build())))
                                .build())
                        .build());
            } catch (Exception e) {
                // Typically: the admin never pressed /start in the bot. Nothing to do about it here.
                log.info("Admin security alert to {} not delivered: {}", adminId, e.getMessage());
            }
        });
    }

    /** [Заблокировать] pressed. */
    public void onCallback(CallbackQuery cq) {
        String data = cq.getData();
        long fromId = cq.getFrom().getId();
        long adminId;
        try {
            adminId = Long.parseLong(data.substring(BLOCK_PREFIX.length()));
        } catch (NumberFormatException e) {
            answer(cq.getId(), null);
            return;
        }
        // Only the admin the alert was about — the button lives in their private chat anyway.
        if (adminId != fromId || adminUserRepository.findById(adminId).isEmpty()) {
            answer(cq.getId(), "Недоступно");
            return;
        }
        int devices = sessions.revokeEverything(adminId);
        audit.recordFor(adminId, "ADMIN_BLOCK_TG", "AUTH", String.valueOf(adminId),
                "«Заблокировать» в Telegram: все сессии завершены, забыто доверенных устройств: " + devices);
        log.warn("Admin {} ended all sessions from the Telegram alert", adminId);
        answer(cq.getId(), "Все сессии завершены");
        MaybeInaccessibleMessage m = cq.getMessage();
        if (m != null) {
            String original = m instanceof Message msg && msg.getText() != null ? esc(msg.getText()) + "\n\n" : "";
            try {
                bot.execute(EditMessageText.builder()
                        .chatId(String.valueOf(m.getChatId()))
                        .messageId(m.getMessageId())
                        .text(original + "✅ <b>Все сессии завершены, смените пароль.</b>")
                        .parseMode("HTML")
                        .build());
            } catch (Exception e) {
                log.debug("Edit of the alert failed: {}", e.getMessage());
            }
        }
    }

    private void answer(String callbackQueryId, String text) {
        try {
            bot.execute(AnswerCallbackQuery.builder().callbackQueryId(callbackQueryId).text(text).build());
        } catch (Exception e) {
            log.debug("answerCallbackQuery failed: {}", e.getMessage());
        }
    }

    private boolean enabled() {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
    }

    private String time(Instant at) {
        return HHMM.format(at.atZone(zone));
    }

    static String esc(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
