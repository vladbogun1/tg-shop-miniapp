package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.push.PushSubscriptionStore;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.AdminTokenValidator;
import org.springframework.stereotype.Service;

/**
 * Ends everything an admin is signed in with: every access token and half-finished sign-in
 * ({@code token_version + 1}), every remembered device and every push subscription (a phone that
 * was signed out must not keep showing order and chat notifications). Used by «Выйти на всех
 * устройствах», «Заблокировать» under a Telegram alert, password change, 2FA reset and the
 * emergency reset. After the next sign-in the admin panel offers to turn push back on.
 */
@Service
public class AdminSessions {

    private final AdminUserRepository adminUserRepository;
    private final AdminTokenValidator adminTokenValidator;
    private final TrustedDeviceService trustedDevices;
    private final PushSubscriptionStore pushSubscriptions;

    public AdminSessions(AdminUserRepository adminUserRepository,
                         AdminTokenValidator adminTokenValidator,
                         TrustedDeviceService trustedDevices,
                         PushSubscriptionStore pushSubscriptions) {
        this.adminUserRepository = adminUserRepository;
        this.adminTokenValidator = adminTokenValidator;
        this.trustedDevices = trustedDevices;
        this.pushSubscriptions = pushSubscriptions;
    }

    /** @return how many trusted devices were forgotten */
    public int revokeEverything(long adminId) {
        adminUserRepository.bumpTokenVersion(adminId);
        adminTokenValidator.invalidate(adminId);
        pushSubscriptions.deleteByAdmin(adminId);
        return trustedDevices.revokeAll(adminId);
    }
}
