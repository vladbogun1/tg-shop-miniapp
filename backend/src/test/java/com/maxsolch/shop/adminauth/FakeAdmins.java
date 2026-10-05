package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.domain.AdminRole;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

/** admin_users in memory behind a mocked {@link AdminUserRepository} (only what stage 2 uses). */
final class FakeAdmins {

    final Map<Long, AdminUser> rows = new LinkedHashMap<>();
    final AdminUserRepository repo = mock(AdminUserRepository.class);

    FakeAdmins() {
        lenient().when(repo.findById(anyLong())).thenAnswer(i -> Optional.ofNullable(rows.get((Long) i.getArgument(0))));
        lenient().when(repo.findByTelegramUserIdAndActiveTrue(anyLong()))
                .thenAnswer(i -> Optional.ofNullable(rows.get((Long) i.getArgument(0))).filter(AdminUser::isActive));
        lenient().when(repo.findByUsername(anyString())).thenAnswer(i -> rows.values().stream()
                .filter(a -> a.getUsername() != null && a.getUsername().equalsIgnoreCase(i.getArgument(0)))
                .findFirst());
        lenient().when(repo.findAll()).thenAnswer(i -> new ArrayList<>(rows.values()));
        lenient().when(repo.save(any(AdminUser.class))).thenAnswer(i -> put(i.getArgument(0)));
        lenient().when(repo.saveAndFlush(any(AdminUser.class))).thenAnswer(i -> put(i.getArgument(0)));
        lenient().doAnswer(i -> rows.remove((Long) i.getArgument(0))).when(repo).deleteById(anyLong());
        lenient().when(repo.countOtherActiveSupersWith2fa(anyLong())).thenAnswer(i -> rows.values().stream()
                .filter(a -> a.isActive() && a.isSuperAdmin() && a.getTotpSecretEnc() != null
                        && a.getTelegramUserId() != (long) (Long) i.getArgument(0))
                .count());
        lenient().when(repo.acceptTotpStep(anyLong(), anyLong())).thenAnswer(i -> {
            AdminUser a = rows.get((Long) i.getArgument(0));
            long step = i.getArgument(1);
            if (a != null && (a.getTotpLastStep() == null || a.getTotpLastStep() < step)) {
                a.setTotpLastStep(step);
                return 1;
            }
            return 0;
        });
        lenient().when(repo.incrementFailures(anyLong())).thenAnswer(i -> {
            AdminUser a = rows.get((Long) i.getArgument(0));
            a.setFailedAttempts(a.getFailedAttempts() + 1);
            return 1;
        });
        lenient().when(repo.failuresOf(anyLong())).thenAnswer(i ->
                Optional.ofNullable(rows.get((Long) i.getArgument(0))).map(AdminUser::getFailedAttempts));
        lenient().when(repo.lockUntil(anyLong(), any())).thenAnswer(i -> {
            AdminUser a = rows.get((Long) i.getArgument(0));
            a.setLockedUntil(i.getArgument(1));
            a.setFailedAttempts(0);
            return 1;
        });
        lenient().when(repo.bumpTokenVersion(anyLong())).thenAnswer(i -> {
            AdminUser a = rows.get((Long) i.getArgument(0));
            a.setTokenVersion(a.getTokenVersion() + 1);
            return 1;
        });
    }

    private AdminUser put(AdminUser a) {
        rows.put(a.getTelegramUserId(), a);
        return a;
    }

    AdminUser add(long id, String username, AdminRole role, String totpSecretEnc) {
        AdminUser a = new AdminUser();
        a.setTelegramUserId(id);
        a.setUsername(username);
        a.setName("Admin " + id);
        a.setPasswordHash(username == null ? null : "$2a$04$hash");
        a.setRole(role);
        a.setActive(true);
        a.setTotpSecretEnc(totpSecretEnc);
        a.setTotpEnabledAt(totpSecretEnc == null ? null : Instant.EPOCH);
        rows.put(id, a);
        return a;
    }
}
