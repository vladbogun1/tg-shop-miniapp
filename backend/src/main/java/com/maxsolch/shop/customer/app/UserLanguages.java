package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.infra.UserRepository;
import com.maxsolch.shop.platform.i18n.CustomerLanguages;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** The customer's language for {@code Messages}: his own pick first, Telegram's language code second. */
@Component
public class UserLanguages implements CustomerLanguages {

    private final UserRepository users;

    public UserLanguages(UserRepository users) {
        this.users = users;
    }

    @Override
    public Optional<Languages> of(long telegramUserId) {
        return users.findById(telegramUserId).map(u -> new Languages(u.getLocale(), u.getLanguageCode()));
    }
}
