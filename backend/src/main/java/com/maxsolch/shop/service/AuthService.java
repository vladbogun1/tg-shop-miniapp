package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.security.TelegramUser;
import com.maxsolch.shop.security.TgInitDataValidator;
import com.maxsolch.shop.web.dto.AuthResponse;
import com.maxsolch.shop.web.dto.AuthUserDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Customer login (Mini App initData) and the users-table snapshot of Telegram profiles. The admin
 * sign-in (password / Telegram + 2FA) lives in {@link com.maxsolch.shop.adminauth.AdminAuthService}.
 */
@Service
public class AuthService {

    private final TgInitDataValidator initDataValidator;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final AdminUserRepository adminUserRepository;
    private final com.maxsolch.shop.journal.ActivityLog activity;

    public AuthService(TgInitDataValidator initDataValidator,
                       JwtService jwtService,
                       UserRepository userRepository,
                       AdminUserRepository adminUserRepository,
                       com.maxsolch.shop.journal.ActivityLog activity) {
        this.initDataValidator = initDataValidator;
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.adminUserRepository = adminUserRepository;
        this.activity = activity;
    }

    /**
     * Customer login: validate initData, upsert the users row, issue a ROLE_CUSTOMER token.
     * {@code admin} is true if the telegram id is an active admin.
     */
    @Transactional
    public AuthResponse authenticateCustomer(String initData) {
        TelegramUser tgUser = initDataValidator.validate(initData);
        User user = upsertUser(tgUser, com.maxsolch.shop.journal.ActivityLog.MINIAPP);
        boolean admin = adminUserRepository.existsByTelegramUserIdAndActiveTrue(tgUser.id());

        String token = jwtService.issueToken(tgUser.id(), Role.CUSTOMER);
        AuthUserDto dto = new AuthUserDto(
                user.getTelegramUserId(),
                user.getUsername(),
                user.getFirstName(),
                user.getLastName(),
                admin);
        return AuthResponse.of(token, dto);
    }

    /**
     * Record/refresh a user that interacted with the bot directly (e.g. /start),
     * so the admin Users list captures people who opened the bot but not the Mini App.
     */
    @Transactional
    public void recordBotUser(TelegramUser tgUser) {
        if (tgUser == null || tgUser.id() <= 0) {
            return;
        }
        upsertUser(tgUser, com.maxsolch.shop.journal.ActivityLog.BOT);
    }

    /** @param source where a first-time customer showed up (journaled as REGISTERED) */
    private User upsertUser(TelegramUser tgUser, String source) {
        boolean[] fresh = {false};
        User user = userRepository.findById(tgUser.id()).orElseGet(() -> {
            User u = new User();
            u.setTelegramUserId(tgUser.id());
            fresh[0] = true;
            return u;
        });
        if (fresh[0] && activity != null) {
            activity.recordAfterCommit(com.maxsolch.shop.journal.ActivityLog.Entry.of(source, "REGISTERED")
                    .customer(tgUser.id())
                    .text(com.maxsolch.shop.journal.ActivityLog.BOT.equals(source)
                            ? "Новый пользователь: впервые написал боту"
                            : "Новый пользователь: впервые открыл Mini App")
                    .detail("language", tgUser.languageCode())
                    .detail("premium", tgUser.premium() ? Boolean.TRUE : null));
        }
        user.setUsername(tgUser.username());
        user.setFirstName(tgUser.firstName());
        user.setLastName(tgUser.lastName());
        if (tgUser.languageCode() != null) {
            user.setLanguageCode(tgUser.languageCode());
        }
        user.setPremium(tgUser.premium());
        if (tgUser.photoUrl() != null) {
            user.setPhotoUrl(tgUser.photoUrl());
        }
        // They're clearly reachable again — clear any previous "blocked" flag.
        user.setBotBlocked(false);
        user.setBotBlockedAt(null);
        user.setLastSeenAt(Instant.now());
        return userRepository.save(user);
    }
}
