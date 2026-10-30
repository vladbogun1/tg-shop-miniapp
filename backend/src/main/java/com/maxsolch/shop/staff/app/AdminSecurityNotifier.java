package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.notification.app.SellerChannel;
import com.maxsolch.shop.notification.domain.BotCallbackHandler;
import com.maxsolch.shop.notification.domain.TelegramGateway;
import com.maxsolch.shop.platform.journal.ActivityLog;

import com.maxsolch.shop.staff.domain.AdminInvite;
import com.maxsolch.shop.staff.domain.LoginMethod;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.staff.infra.AdminUserRepository;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
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
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static com.maxsolch.shop.platform.util.Texts.escHtml;

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
public class AdminSecurityNotifier implements AdminSecurityAlerts, AdminTeamMessenger, BotCallbackHandler {

    static final String BLOCK_PREFIX = "asb:";
    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("dd.MM HH:mm");

    private final TelegramGateway bot;
    private final SellerChannel seller;
    private final AdminSessions sessions;
    private final AdminUserRepository adminUserRepository;
    private final AdminAuditService audit;
    private final ZoneId zone;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "admin-security-alerts");
        t.setDaemon(true);
        return t;
    });

    public AdminSecurityNotifier(TelegramGateway bot, SellerChannel seller, AppProperties props,
                                 @Lazy AdminSessions sessions, AdminUserRepository adminUserRepository,
                                 AdminAuditService audit) {
        this.bot = bot;
        this.seller = seller;
        this.sessions = sessions;
        this.adminUserRepository = adminUserRepository;
        this.audit = audit;
        this.zone = ShopZone.of(props.getTimezone()).zone();
    }

    /** First line of an alert, for the journal (the rest carries IPs and places). */
    private static String firstLine(String html) {
        if (html == null) {
            return null;
        }
        int nl = html.indexOf('\n');
        return nl < 0 ? html : html.substring(0, nl);
    }

    @Override
    public boolean handles(String callbackData) {
        return callbackData != null && callbackData.startsWith(BLOCK_PREFIX);
    }

    @Override
    public void newDeviceLogin(long adminId, LoginMethod method, String place, String device, String ip, Instant at) {
        String text = "🔐 <b>Вход в админку</b>: " + escHtml(place) + ", " + escHtml(device) + ", " + time(at) + "\n"
                + "Способ: " + escHtml(method.label()) + ", IP " + escHtml(ip) + "\n\n"
                + "Это не вы? Нажмите «Заблокировать» — все сессии и доверенные устройства будут завершены.";
        send(adminId, text);
    }

    @Override
    public void accountLocked(long adminId, String place, String device, String ip, Instant until) {
        String text = "⛔ <b>Вход в админку заблокирован до " + time(until) + "</b>\n"
                + "5 неверных паролей или кодов подряд. Последняя попытка: " + escHtml(place) + ", " + escHtml(device)
                + ", IP " + escHtml(ip) + "\n\n"
                + "Если это не вы — нажмите «Заблокировать» и смените пароль.";
        send(adminId, text);
    }

    @Override
    public boolean sendInvite(long telegramUserId, String link, AdminInvite.Kind kind, String roleLabel,
                              String inviterName, Instant expiresAt) {
        if (!seller.canDmAdmin(telegramUserId) || link == null) {
            return false;
        }
        String what = switch (kind) {
            case NEW -> "🔑 <b>Вас пригласили в админку ChiSetup</b> (роль: " + escHtml(roleLabel) + ").\n"
                    + "Пригласил: " + escHtml(inviterName) + ".\n\n"
                    + "Нажмите кнопку, придумайте логин и пароль и подключите приложение-аутентификатор "
                    + "(Google Authenticator, 1Password, Authy).";
            case CREDENTIALS -> "🔑 <b>Вход в админку ChiSetup по логину и паролю</b>\n"
                    + escHtml(inviterName) + " выдал вам логин. Нажмите кнопку, придумайте логин и пароль"
                    + " (и подключите приложение-аутентификатор, если ещё не подключено).";
            case PASSWORD_RESET -> "🔑 <b>Пароль от админки ChiSetup сброшен</b> главным админом.\n"
                    + "Старый пароль больше не действует, все сессии завершены. Нажмите кнопку и задайте новый.";
        };
        String text = what + "\n\nСсылка одноразовая, действует до " + DAY_TIME.format(expiresAt.atZone(zone))
                + ". Никому её не пересылайте.";
        // The link is a one-time credential: the journal gets only what kind of invite it was.
        ActivityLog.Entry entry = ActivityLog.Entry.bot("ADMIN_INVITE")
                .text("Приглашение в админку: " + kind + ", роль " + roleLabel);
        InlineKeyboardMarkup button = InlineKeyboardMarkup.builder()
                .keyboard(List.of(List.of(InlineKeyboardButton.builder()
                        .text(kind == AdminInvite.Kind.PASSWORD_RESET ? "Задать новый пароль" : "Открыть приглашение")
                        .url(link)
                        .build())))
                .build();
        return seller.dmAdmin("Admin invite to " + telegramUserId + " not delivered", telegramUserId, entry, text, button);
    }

    @Override
    public void accountNotice(long adminId, String html) {
        if (!seller.canDmAdmin(adminId)) {
            return;
        }
        executor.execute(() -> seller.dmAdmin("Admin account notice to " + adminId + " not delivered", adminId,
                ActivityLog.Entry.bot("ADMIN_NOTICE").text(firstLine(html)), html, null));
    }

    private void send(long adminId, String text) {
        if (!seller.canDmAdmin(adminId)) {
            return;
        }
        InlineKeyboardMarkup block = InlineKeyboardMarkup.builder()
                .keyboard(List.of(List.of(InlineKeyboardButton.builder()
                        .text("🚫 Заблокировать")
                        .callbackData(BLOCK_PREFIX + adminId)
                        .build())))
                .build();
        // Typically undelivered when the admin never pressed /start in the bot: nothing to do about it here.
        executor.execute(() -> seller.dmAdmin("Admin security alert to " + adminId + " not delivered", adminId,
                ActivityLog.Entry.bot("ADMIN_SECURITY_ALERT").text(firstLine(text)), text, block));
    }

    @Override
    public boolean recordsUser() {
        return false;
    }

    /** [Заблокировать] pressed. */
    @Override
    public void onCallback(CallbackQuery cq, Locale locale) {
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
            String original = m instanceof Message msg && msg.getText() != null ? escHtml(msg.getText()) + "\n\n" : "";
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

    private String time(Instant at) {
        return HHMM.format(at.atZone(zone));
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
