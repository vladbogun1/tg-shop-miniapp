package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.security.InitDataException;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.security.TelegramUser;
import com.maxsolch.shop.security.TgInitDataValidator;
import com.maxsolch.shop.web.UnauthorizedException;
import com.maxsolch.shop.web.dto.AuthResponse;
import com.maxsolch.shop.web.dto.AuthUserDto;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class AuthService {

    private final TgInitDataValidator initDataValidator;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * Failed password logins per username, whatever the IP. The per-IP limit alone is beaten by
     * spreading guesses over many addresses; this caps guesses against the one account that matters.
     * Fixed one-hour window from the first failure; a successful login clears it.
     */
    static final int MAX_FAILED_LOGINS_PER_HOUR = 10;

    private final Cache<String, AtomicInteger> failedLogins = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofHours(1))
            .build();

    /**
     * Compared against when the username does not exist, so an unknown login costs the same BCrypt
     * round as a wrong password — the response time no longer tells which usernames exist.
     */
    private final String dummyPasswordHash;

    public AuthService(TgInitDataValidator initDataValidator,
                       JwtService jwtService,
                       UserRepository userRepository,
                       AdminUserRepository adminUserRepository,
                       PasswordEncoder passwordEncoder) {
        this.initDataValidator = initDataValidator;
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.dummyPasswordHash = passwordEncoder.encode("no-such-admin-" + UUID.randomUUID());
    }

    /**
     * Admin browser login by username + password (BCrypt). Issues a ROLE_ADMIN token
     * whose subject is the admin's telegram_user_id (PK).
     */
    @Transactional(readOnly = true)
    public AuthResponse authenticateAdminPassword(String username, String password) {
        String login = username == null ? "" : username.trim();
        String throttleKey = login.toLowerCase(Locale.ROOT);
        AtomicInteger failures = failedLogins.getIfPresent(throttleKey);
        if (failures != null && failures.get() >= MAX_FAILED_LOGINS_PER_HOUR) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Слишком много неудачных попыток входа — попробуйте через час");
        }
        AdminUser admin = adminUserRepository.findByUsername(login)
                .filter(AdminUser::isActive)
                .orElse(null);
        String hash = admin == null || admin.getPasswordHash() == null ? dummyPasswordHash : admin.getPasswordHash();
        boolean matches = passwordEncoder.matches(password == null ? "" : password, hash);
        if (admin == null || admin.getPasswordHash() == null || !matches) {
            failedLogins.get(throttleKey, k -> new AtomicInteger()).incrementAndGet();
            throw new UnauthorizedException("Неверный логин или пароль");
        }
        failedLogins.invalidate(throttleKey);
        String token = jwtService.issueToken(admin.getTelegramUserId(), Role.ADMIN,
                admin.getTokenVersion());
        return AuthResponse.tokenOnly(token);
    }

    /**
     * Customer login: validate initData, upsert the users row, issue a ROLE_CUSTOMER token.
     * {@code admin} is true if the telegram id is an active admin.
     */
    @Transactional
    public AuthResponse authenticateCustomer(String initData) {
        TelegramUser tgUser = initDataValidator.validate(initData);
        User user = upsertUser(tgUser);
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
     * Admin login: validate initData, require the telegram id to be an active admin,
     * issue a ROLE_ADMIN token.
     */
    @Transactional
    public AuthResponse authenticateAdmin(String initData) {
        TelegramUser tgUser = initDataValidator.validate(initData);
        AdminUser admin = adminUserRepository.findByTelegramUserIdAndActiveTrue(tgUser.id())
                .orElseThrow(() -> new InitDataException("not an admin"));
        // keep the user profile snapshot fresh too
        upsertUser(tgUser);
        String token = jwtService.issueToken(tgUser.id(), Role.ADMIN, admin.getTokenVersion());
        return AuthResponse.tokenOnly(token);
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
        upsertUser(tgUser);
    }

    private User upsertUser(TelegramUser tgUser) {
        User user = userRepository.findById(tgUser.id()).orElseGet(() -> {
            User u = new User();
            u.setTelegramUserId(tgUser.id());
            return u;
        });
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
