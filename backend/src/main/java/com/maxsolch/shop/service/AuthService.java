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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class AuthService {

    private final TgInitDataValidator initDataValidator;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;

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
    }

    /**
     * Admin browser login by username + password (BCrypt). Issues a ROLE_ADMIN token
     * whose subject is the admin's telegram_user_id (PK).
     */
    @Transactional(readOnly = true)
    public AuthResponse authenticateAdminPassword(String username, String password) {
        AdminUser admin = adminUserRepository.findByUsername(username == null ? null : username.trim())
                .filter(AdminUser::isActive)
                .orElseThrow(() -> new UnauthorizedException("Неверный логин или пароль"));
        if (admin.getPasswordHash() == null
                || !passwordEncoder.matches(password, admin.getPasswordHash())) {
            throw new UnauthorizedException("Неверный логин или пароль");
        }
        String token = jwtService.issueToken(admin.getTelegramUserId(), Role.ADMIN);
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
        boolean admin = adminUserRepository.existsByTelegramUserIdAndActiveTrue(tgUser.id());
        if (!admin) {
            throw new InitDataException("not an admin");
        }
        // keep the user profile snapshot fresh too
        upsertUser(tgUser);
        String token = jwtService.issueToken(tgUser.id(), Role.ADMIN);
        return AuthResponse.tokenOnly(token);
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
        user.setLastSeenAt(Instant.now());
        return userRepository.save(user);
    }
}
