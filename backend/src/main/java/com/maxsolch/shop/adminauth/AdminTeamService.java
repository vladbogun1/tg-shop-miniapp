package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.domain.AdminRole;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.AdminTokenValidator;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import com.maxsolch.shop.web.NotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * «Админы» — the super admin manages the other admins (stage 2). Every endpoint in front of this is
 * {@code @RequiredSuperAdmin} (role read from the database on each request).
 *
 * <p>Rules enforced here, whatever the UI shows:
 * <ul>
 *   <li>nothing in this section acts on the caller's own account — that is «Мой аккаунт»
 *       ({@code SELF});</li>
 *   <li>there is always at least one active SUPER_ADMIN with 2FA: blocking, demoting, resetting 2FA
 *       of or deleting the last one is refused ({@code LAST_SUPER_ADMIN});</li>
 *   <li>dangerous actions — invite, role change, 2FA / password reset, block / unblock, delete —
 *       need the caller's current code from the authenticator app (wrong codes count towards the
 *       caller's lock, as everywhere);</li>
 *   <li>everything is written to the journal (who, on whom, what), and the affected admin gets a
 *       Telegram message about a 2FA / password reset and a block when the bot can reach them.</li>
 * </ul>
 */
@Service
public class AdminTeamService {

    public static final int MAX_NAME = 64;

    public record InviteRow(long id, String kind, long telegramUserId, String name, String role, Instant createdAt,
                            Instant expiresAt, boolean delivered, String invitedByName, String telegramLabel) {
    }

    /**
     * @param status {@code SUPER_ADMIN} / {@code ADMIN} / {@code BLOCKED}; an open invite of a NEW admin
     *               is in {@link Team#invites()} instead
     */
    public record AdminRow(long telegramUserId, String name, String username, String role, String status,
                           boolean active, boolean totpEnabled, boolean passwordSet, Instant createdAt,
                           AdminTeamFacts.LastLogin lastLogin, int trustedDevices, Instant lockedUntil,
                           InviteRow invite, String telegramLabel, boolean self) {
    }

    public record Team(List<AdminRow> admins, List<InviteRow> invites) {
    }

    private final AdminUserRepository repo;
    private final AdminInviteService invites;
    private final AdminInviteStore inviteStore;
    private final AdminTotp totp;
    private final AdminLockout lockout;
    private final AdminSessions sessions;
    private final TrustedDeviceService trustedDevices;
    private final AdminTokenValidator tokenValidator;
    private final AdminTeamFacts facts;
    private final AdminAuditService audit;
    private final AdminTeamMessenger messenger;
    private final Clock clock;

    @Autowired
    public AdminTeamService(AdminUserRepository repo, AdminInviteService invites, AdminInviteStore inviteStore,
                            AdminTotp totp, AdminLockout lockout, AdminSessions sessions,
                            TrustedDeviceService trustedDevices, AdminTokenValidator tokenValidator,
                            AdminTeamFacts facts, AdminAuditService audit, @Lazy AdminTeamMessenger messenger) {
        this(repo, invites, inviteStore, totp, lockout, sessions, trustedDevices, tokenValidator, facts, audit,
                messenger, Clock.systemUTC());
    }

    AdminTeamService(AdminUserRepository repo, AdminInviteService invites, AdminInviteStore inviteStore,
                     AdminTotp totp, AdminLockout lockout, AdminSessions sessions,
                     TrustedDeviceService trustedDevices, AdminTokenValidator tokenValidator,
                     AdminTeamFacts facts, AdminAuditService audit, AdminTeamMessenger messenger, Clock clock) {
        this.repo = repo;
        this.invites = invites;
        this.inviteStore = inviteStore;
        this.totp = totp;
        this.lockout = lockout;
        this.sessions = sessions;
        this.trustedDevices = trustedDevices;
        this.tokenValidator = tokenValidator;
        this.facts = facts;
        this.audit = audit;
        this.messenger = messenger;
        this.clock = clock;
    }

    // ================================================================== list

    public Team team(long callerId) {
        Instant now = clock.instant();
        List<AdminUser> all = repo.findAll();
        Map<Long, AdminUser> byId = all.stream().collect(Collectors.toMap(AdminUser::getTelegramUserId, Function.identity()));
        List<AdminInvite> open = inviteStore.live(now);
        Set<Long> tgIds = new HashSet<>(byId.keySet());
        open.forEach(i -> tgIds.add(i.telegramUserId()));
        Map<Long, String> labels = facts.telegramLabels(tgIds);
        Map<Long, AdminTeamFacts.LastLogin> logins = facts.lastLogins();
        Map<Long, Integer> devices = facts.trustedDevices();

        List<InviteRow> newInvites = new ArrayList<>();
        Map<Long, InviteRow> inviteOf = new java.util.HashMap<>();
        for (AdminInvite i : open) {
            InviteRow row = new InviteRow(i.id(), i.kind().name(), i.telegramUserId(),
                    i.kind() == AdminInvite.Kind.NEW ? i.name()
                            : Optional.ofNullable(byId.get(i.telegramUserId())).map(AdminAuthService::displayName).orElse(i.name()),
                    i.role().name(), i.createdAt(), i.expiresAt(), i.delivered(),
                    Optional.ofNullable(byId.get(i.invitedBy())).map(AdminAuthService::displayName).orElse(null),
                    labels.get(i.telegramUserId()));
            if (i.kind() == AdminInvite.Kind.NEW && !byId.containsKey(i.telegramUserId())) {
                newInvites.add(row);
            } else {
                inviteOf.putIfAbsent(i.telegramUserId(), row);
            }
        }

        List<AdminRow> rows = all.stream()
                .sorted(Comparator.comparingInt((AdminUser a) -> !a.isActive() ? 2 : a.isSuperAdmin() ? 0 : 1)
                        .thenComparing(a -> a.getCreatedAt() == null ? Instant.EPOCH : a.getCreatedAt()))
                .map(a -> new AdminRow(a.getTelegramUserId(), a.getName(), a.getUsername(), a.getRole().name(),
                        !a.isActive() ? "BLOCKED" : a.getRole().name(), a.isActive(), a.isTotpEnabled(),
                        a.getPasswordHash() != null, a.getCreatedAt(), logins.get(a.getTelegramUserId()),
                        devices.getOrDefault(a.getTelegramUserId(), 0),
                        a.getLockedUntil() != null && a.getLockedUntil().isAfter(now) ? a.getLockedUntil() : null,
                        inviteOf.get(a.getTelegramUserId()), labels.get(a.getTelegramUserId()),
                        a.getTelegramUserId() == callerId))
                .toList();
        return new Team(rows, newInvites);
    }

    // ================================================================== invites

    public AdminInviteService.Created invite(long callerId, Long telegramUserId, String name, String role, String code,
                                             ClientInfo client) {
        if (telegramUserId == null || telegramUserId <= 0) {
            throw new BadRequestException("Укажите Telegram пользователя (числовой id)", "BAD_TELEGRAM_ID");
        }
        long tgId = telegramUserId;
        if (tgId == callerId) {
            throw self();
        }
        AdminUser existing = repo.findById(tgId).orElse(null);
        AdminInvite.Kind kind;
        String inviteName;
        AdminRole inviteRole;
        if (existing != null) {
            if (!existing.isActive()) {
                throw new ConflictException("Этот админ заблокирован — сначала разблокируйте его", "BLOCKED");
            }
            if (existing.getUsername() != null && existing.getPasswordHash() != null) {
                throw new ConflictException("У этого админа уже есть логин и пароль. Если он их забыл — «Сбросить пароль»",
                        "HAS_LOGIN");
            }
            kind = AdminInvite.Kind.CREDENTIALS;
            inviteName = existing.getName();
            inviteRole = existing.getRole();
        } else {
            kind = AdminInvite.Kind.NEW;
            inviteName = validName(name);
            inviteRole = parseRole(role);
        }
        requireOwnCode(callerId, code, client, "приглашение админа");
        AdminInviteService.Created created = invites.create(kind, tgId, inviteName, inviteRole, callerId);
        audit.recordFor(callerId, "ADMIN_INVITE", "ADMIN", String.valueOf(tgId),
                (kind == AdminInvite.Kind.NEW
                        ? "приглашён новый админ «" + inviteName + "» (tg " + tgId + "), роль: " + AdminInviteService.roleLabel(inviteRole)
                        : "ссылка для входа по логину и паролю админу «" + AdminAuthService.displayName(existing) + "» (tg " + tgId + ")")
                        + deliveredNote(created) + ", IP " + client.ip());
        return created;
    }

    /** A new link for an open (or expired) invite; the old link stops working. */
    public AdminInviteService.Created resendInvite(long callerId, long inviteId) {
        AdminInvite inv = inviteStore.byId(inviteId).orElseThrow(() -> new NotFoundException("Приглашение не найдено"));
        if (inv.usedAt() != null || inv.revokedAt() != null) {
            throw new ConflictException("Приглашение уже принято или отозвано", "INVITE_CLOSED");
        }
        AdminUser existing = repo.findById(inv.telegramUserId()).orElse(null);
        if (inv.kind() == AdminInvite.Kind.NEW ? existing != null : existing == null || !existing.isActive()) {
            throw new ConflictException("Приглашение больше не подходит к этой учётке — создайте новое", "INVITE_CLOSED");
        }
        AdminInviteService.Created created = invites.create(inv.kind(), inv.telegramUserId(), inv.name(), inv.role(),
                callerId);
        audit.recordFor(callerId, "ADMIN_INVITE_RESENT", "ADMIN", String.valueOf(inv.telegramUserId()),
                "приглашение отправлено заново (tg " + inv.telegramUserId() + "), старая ссылка недействительна"
                        + deliveredNote(created));
        return created;
    }

    public void revokeInvite(long callerId, long inviteId) {
        AdminInvite inv = inviteStore.byId(inviteId).orElseThrow(() -> new NotFoundException("Приглашение не найдено"));
        if (!inviteStore.revoke(inviteId, clock.instant())) {
            throw new ConflictException("Приглашение уже принято или отозвано", "INVITE_CLOSED");
        }
        audit.recordFor(callerId, "ADMIN_INVITE_REVOKED", "ADMIN", String.valueOf(inv.telegramUserId()),
                "приглашение отозвано (tg " + inv.telegramUserId() + ", " + (inv.name() == null ? "без имени" : inv.name()) + ")");
    }

    // ================================================================== actions on an admin

    /** Name and / or role. A role change needs the caller's code; demoting the last super admin is refused. */
    public void update(long callerId, long targetId, String name, String role, String code, ClientInfo client) {
        AdminUser target = find(targetId);
        AdminRole newRole = role == null || role.isBlank() ? target.getRole() : parseRole(role);
        boolean roleChange = newRole != target.getRole();
        guard(callerId, target, roleChange && newRole == AdminRole.ADMIN);
        String newName = name == null ? target.getName() : validName(name);
        boolean nameChange = !java.util.Objects.equals(newName, target.getName());
        if (!roleChange && !nameChange) {
            return;
        }
        if (roleChange) {
            requireOwnCode(callerId, code, client, "смена роли админа");
        }
        AdminUser fresh = find(targetId);
        StringBuilder details = new StringBuilder();
        if (nameChange) {
            details.append("имя: «").append(fresh.getName() == null ? "" : fresh.getName()).append("» → «")
                    .append(newName).append("»");
            fresh.setName(newName);
        }
        if (roleChange) {
            if (!details.isEmpty()) {
                details.append("; ");
            }
            details.append("роль: ").append(AdminInviteService.roleLabel(fresh.getRole())).append(" → ")
                    .append(AdminInviteService.roleLabel(newRole));
            fresh.setRole(newRole);
        }
        repo.save(fresh);
        tokenValidator.invalidate(targetId);
        audit.recordFor(callerId, "ADMIN_UPDATE", "ADMIN", String.valueOf(targetId),
                who(fresh) + ": " + details);
    }

    /** «Сбросить 2FA»: the next sign-in sets it up again; every session and trusted device ends. */
    public void resetTwoFactor(long callerId, long targetId, String code, ClientInfo client) {
        AdminUser target = find(targetId);
        guard(callerId, target, true);
        requireOwnCode(callerId, code, client, "сброс 2FA админа");
        AdminUser fresh = find(targetId);
        AdminTotp.clear(fresh);
        fresh.setFailedAttempts(0);
        fresh.setLockedUntil(null);
        repo.save(fresh);
        int devices = sessions.revokeEverything(targetId);
        audit.recordFor(callerId, "ADMIN_2FA_RESET_BY", "ADMIN", String.valueOf(targetId),
                who(fresh) + ": 2FA сброшена, сессии завершены, забыто доверенных устройств: " + devices
                        + ", IP " + client.ip());
        notice(targetId, "🔐 <b>Двухфакторная защита вашей учётки в админке ChiSetup сброшена</b> главным админом.\n"
                + "Все сессии завершены. При следующем входе админка попросит заново подключить "
                + "приложение-аутентификатор.\n\nЕсли вы об этом не просили — сразу сообщите главному админу.");
    }

    /**
     * «Сбросить пароль»: the old password stops working at once, sessions end, and a new invite link
     * (set a password; plus the current code, or 2FA setup when it is off) goes to the admin.
     */
    public AdminInviteService.Created resetPassword(long callerId, long targetId, String code, ClientInfo client) {
        AdminUser target = find(targetId);
        guard(callerId, target, false);
        if (!target.isActive()) {
            throw new ConflictException("Админ заблокирован — сначала разблокируйте", "BLOCKED");
        }
        requireOwnCode(callerId, code, client, "сброс пароля админа");
        AdminUser fresh = find(targetId);
        fresh.setPasswordHash(null);
        fresh.setPasswordChangedAt(null);
        repo.save(fresh);
        int devices = sessions.revokeEverything(targetId);
        AdminInvite.Kind kind = fresh.getUsername() == null ? AdminInvite.Kind.CREDENTIALS : AdminInvite.Kind.PASSWORD_RESET;
        AdminInviteService.Created created = invites.create(kind, targetId, fresh.getName(), fresh.getRole(), callerId);
        audit.recordFor(callerId, "ADMIN_PASSWORD_RESET_BY", "ADMIN", String.valueOf(targetId),
                who(fresh) + ": пароль сброшен (старый не действует), сессии завершены, забыто доверенных устройств: "
                        + devices + ", ссылка на новый пароль" + deliveredNote(created) + ", IP " + client.ip());
        return created;
    }

    public int forgetDevices(long callerId, long targetId) {
        AdminUser target = find(targetId);
        guard(callerId, target, false);
        int n = trustedDevices.revokeAll(targetId);
        audit.recordFor(callerId, "ADMIN_DEVICES_FORGET_BY", "ADMIN", String.valueOf(targetId),
                who(target) + ": забыто доверенных устройств: " + n);
        return n;
    }

    /** «Заблокировать»: active = false and token_version + 1 — out everywhere at once, no sign-in at all. */
    public void block(long callerId, long targetId, String code, ClientInfo client) {
        AdminUser target = find(targetId);
        guard(callerId, target, true);
        if (!target.isActive()) {
            return;
        }
        requireOwnCode(callerId, code, client, "блокировка админа");
        AdminUser fresh = find(targetId);
        fresh.setActive(false);
        repo.save(fresh);
        int push = facts.deletePushSubscriptions(targetId); // before revokeEverything, which also drops them: keeps the count for the journal
        int devices = sessions.revokeEverything(targetId);
        int links = inviteStore.revokeOpenFor(targetId, clock.instant());
        audit.recordFor(callerId, "ADMIN_BLOCKED", "ADMIN", String.valueOf(targetId),
                who(fresh) + ": заблокирован; сессии завершены, забыто доверенных устройств: " + devices
                        + ", отозвано ссылок: " + links + ", отключено push-подписок: " + push + ", IP " + client.ip());
        notice(targetId, "⛔ <b>Ваш доступ к админке ChiSetup заблокирован</b> главным админом.\n"
                + "Все сессии завершены, вход паролем и через Telegram невозможен.");
    }

    public void unblock(long callerId, long targetId, String code, ClientInfo client) {
        AdminUser target = find(targetId);
        guard(callerId, target, false);
        if (target.isActive()) {
            return;
        }
        requireOwnCode(callerId, code, client, "разблокировка админа");
        AdminUser fresh = find(targetId);
        fresh.setActive(true);
        fresh.setFailedAttempts(0);
        fresh.setLockedUntil(null);
        repo.save(fresh);
        tokenValidator.invalidate(targetId);
        audit.recordFor(callerId, "ADMIN_UNBLOCKED", "ADMIN", String.valueOf(targetId),
                who(fresh) + ": разблокирован, IP " + client.ip());
        notice(targetId, "✅ <b>Доступ к админке ChiSetup восстановлен</b> главным админом.");
    }

    /** Only an admin without history in the shop's data ({@link AdminTeamFacts#history}); otherwise block. */
    public void delete(long callerId, long targetId, String code, ClientInfo client) {
        AdminUser target = find(targetId);
        guard(callerId, target, true);
        List<String> history = facts.history(targetId);
        if (!history.isEmpty()) {
            throw new ConflictException("Удалить нельзя: у админа есть история (" + String.join(", ", history)
                    + "). Заблокируйте его — история сохранится.", "HAS_HISTORY");
        }
        requireOwnCode(callerId, code, client, "удаление админа");
        String label = who(target);
        inviteStore.revokeOpenFor(targetId, clock.instant());
        trustedDevices.revokeAll(targetId);
        facts.deletePushSubscriptions(targetId);
        repo.deleteById(targetId);
        tokenValidator.invalidate(targetId);
        audit.recordFor(callerId, "ADMIN_DELETED", "ADMIN", String.valueOf(targetId),
                label + ": учётка удалена, IP " + client.ip());
    }

    // ================================================================== rules

    /**
     * The target exists, is not the caller, and — when the action could leave no one able to manage
     * admins — is not the last active SUPER_ADMIN with 2FA. The «last super admin» answer wins over
     * «yourself», so demoting / blocking the only super admin is always explained as such.
     */
    void guard(long callerId, AdminUser target, boolean touchesLastSuper) {
        if (touchesLastSuper && target.isActive() && target.isSuperAdmin() && target.isTotpEnabled()
                && repo.countOtherActiveSupersWith2fa(target.getTelegramUserId()) == 0) {
            throw new ConflictException("Это последний главный админ с 2FA — без него некому управлять админами. "
                    + "Сначала назначьте главным другого админа.", "LAST_SUPER_ADMIN");
        }
        if (target.getTelegramUserId() == callerId) {
            throw self();
        }
    }

    private void requireOwnCode(long callerId, String code, ClientInfo client, String what) {
        AdminUser caller = repo.findByTelegramUserIdAndActiveTrue(callerId)
                .orElseThrow(() -> new com.maxsolch.shop.web.UnauthorizedException("not authenticated"));
        if (code == null || code.isBlank()) {
            throw new BadRequestException("Введите код из приложения-аутентификатора", "CODE_REQUIRED");
        }
        if (!totp.verifyActive(caller, code)) {
            audit.recordFor(callerId, "ADMIN_ACCOUNT_FAIL", "AUTH", String.valueOf(callerId),
                    "неверный код 2FA: " + what + ", IP " + client.ip());
            lockout.registerFailure(callerId, LoginMethod.PASSWORD, client);
            throw new BadRequestException("Неверный код из приложения", "BAD_CODE");
        }
    }

    private void notice(long adminId, String html) {
        try {
            messenger.accountNotice(adminId, html);
        } catch (Exception ignored) {
            // best effort — the journal has the record anyway
        }
    }

    private AdminUser find(long id) {
        return repo.findById(id).orElseThrow(() -> new NotFoundException("Админ не найден"));
    }

    static String validName(String name) {
        String n = name == null ? "" : name.trim();
        if (n.isEmpty() || n.codePointCount(0, n.length()) > MAX_NAME) {
            throw new BadRequestException("Имя: от 1 до " + MAX_NAME + " символов", "BAD_NAME");
        }
        return n;
    }

    static AdminRole parseRole(String role) {
        try {
            return AdminRole.valueOf(role == null ? "" : role.trim());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Роль: ADMIN или SUPER_ADMIN", "BAD_ROLE");
        }
    }

    private static ConflictException self() {
        return new ConflictException("Свою учётку меняйте в «Мой аккаунт» — здесь только другие админы", "SELF");
    }

    private static String who(AdminUser a) {
        return "«" + AdminAuthService.displayName(a) + "» (tg " + a.getTelegramUserId() + ")";
    }

    private static String deliveredNote(AdminInviteService.Created c) {
        return c.delivered() ? ", ссылка отправлена ботом" : ", бот не смог написать — ссылка показана главному";
    }
}
