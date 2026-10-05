package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.AdminTokenValidator;
import org.springframework.stereotype.Service;

/**
 * Ends everything an admin is signed in with: every access token and half-finished sign-in
 * ({@code token_version + 1}) and every remembered device. Used by «Выйти на всех устройствах»,
 * «Заблокировать» under a Telegram alert, password change, 2FA reset and the emergency reset.
 */
@Service
public class AdminSessions {

    private final AdminUserRepository adminUserRepository;
    private final AdminTokenValidator adminTokenValidator;
    private final TrustedDeviceService trustedDevices;

    public AdminSessions(AdminUserRepository adminUserRepository,
                         AdminTokenValidator adminTokenValidator,
                         TrustedDeviceService trustedDevices) {
        this.adminUserRepository = adminUserRepository;
        this.adminTokenValidator = adminTokenValidator;
        this.trustedDevices = trustedDevices;
    }

    /** @return how many trusted devices were forgotten */
    public int revokeEverything(long adminId) {
        adminUserRepository.bumpTokenVersion(adminId);
        adminTokenValidator.invalidate(adminId);
        return trustedDevices.revokeAll(adminId);
    }
}
