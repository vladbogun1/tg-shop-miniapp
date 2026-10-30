package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.domain.AdminInvite;
import com.maxsolch.shop.staff.domain.AdminInviteStore;
import com.maxsolch.shop.staff.domain.AdminUser;
import com.maxsolch.shop.staff.infra.AdminTeamQueries;
import com.maxsolch.shop.staff.infra.AdminUserRepository;
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
 * The «Админы» list: every admin with role, 2FA, last sign-in, devices and an open invite, plus the open
 * invites of new admins. Read-only; what can be done to an admin is {@link AdminTeamService}.
 */
@Service
public class AdminTeamView {

    public record InviteRow(long id, String kind, long telegramUserId, String name, String role, Instant createdAt,
                            Instant expiresAt, boolean delivered, String invitedByName, String telegramLabel) {
    }

    /**
     * @param status {@code SUPER_ADMIN} / {@code ADMIN} / {@code BLOCKED}; an open invite of a NEW admin
     *               is in {@link Team#invites()} instead
     */
    public record AdminRow(long telegramUserId, String name, String username, String role, String status,
                           boolean active, boolean totpEnabled, boolean passwordSet, Instant createdAt,
                           AdminTeamQueries.LastLogin lastLogin, int trustedDevices, Instant lockedUntil,
                           InviteRow invite, String telegramLabel, boolean self, boolean finance) {
    }

    public record Team(List<AdminRow> admins, List<InviteRow> invites) {
    }
    private final AdminUserRepository repo;
    private final AdminInviteStore inviteStore;
    private final AdminTeamQueries facts;
    private final Clock clock;

    public AdminTeamView(AdminUserRepository repo, AdminInviteStore inviteStore, AdminTeamQueries facts, Clock clock) {
        this.repo = repo;
        this.inviteStore = inviteStore;
        this.facts = facts;
        this.clock = clock;
    }

    public Team team(long callerId) {
        Instant now = clock.instant();
        List<AdminUser> all = repo.findAll();
        Map<Long, AdminUser> byId = all.stream().collect(Collectors.toMap(AdminUser::getTelegramUserId, Function.identity()));
        List<AdminInvite> open = inviteStore.live(now);
        Set<Long> tgIds = new HashSet<>(byId.keySet());
        open.forEach(i -> tgIds.add(i.telegramUserId()));
        Map<Long, String> labels = facts.telegramLabels(tgIds);
        Map<Long, AdminTeamQueries.LastLogin> logins = facts.lastLogins();
        Map<Long, Integer> devices = facts.trustedDevices(clock.instant());

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
                        a.getTelegramUserId() == callerId, a.isFinance() || a.isSuperAdmin()))
                .toList();
        return new Team(rows, newInvites);
    }
}
