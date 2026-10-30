package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.staff.app.Admins;
import com.maxsolch.shop.customer.infra.UserRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;

/** The signed-in customer's own profile and interface language. */
@Service
public class CustomerProfileService {

    /** The language moved from {@code before} (null = never chosen) to {@code after}. */
    public record LocaleChange(String before, String after) {
    }

    private final UserRepository userRepository;
    private final Admins adminUserRepository;

    public CustomerProfileService(UserRepository userRepository, Admins adminUserRepository) {
        this.userRepository = userRepository;
        this.adminUserRepository = adminUserRepository;
    }

    /** Name and username as Telegram gave them; a bare profile when the user row is not there yet. */
    public MeProfileDto profile(long userId) {
        boolean admin = adminUserRepository.isActive(userId);
        return userRepository.findById(userId)
                .map(u -> new MeProfileDto(u.getTelegramUserId(), u.getUsername(),
                        u.getFirstName(), u.getLastName(), admin))
                .orElseGet(() -> new MeProfileDto(userId, null, null, null, admin));
    }

    /**
     * Remembers the language the customer chose ({@code language} is already a supported one).
     * The row is saved even when nothing changed; the result is present only when the language
     * actually changed, and empty for an unknown user.
     */
    public Optional<LocaleChange> changeLocale(long userId, String language) {
        return userRepository.findById(userId).flatMap(user -> {
            String before = user.getLocale();
            user.setLocale(language);
            userRepository.save(user);
            return language.equals(before) ? Optional.empty() : Optional.of(new LocaleChange(before, language));
        });
    }
}
