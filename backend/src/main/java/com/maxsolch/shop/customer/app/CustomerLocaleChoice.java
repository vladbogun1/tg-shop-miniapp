package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.journal.ActivityLog;
import org.springframework.stereotype.Service;

import java.util.Locale;

/** The customer picks the app language: remembered, and the change is noted in the journal. */
@Service
public class CustomerLocaleChoice {

    private final CustomerProfileService profiles;
    private final ActivityLog activity;

    public CustomerLocaleChoice(CustomerProfileService profiles, ActivityLog activity) {
        this.profiles = profiles;
        this.activity = activity;
    }

    /** An unsupported value is ignored rather than rejected. */
    public void choose(long userId, String rawLocale) {
        Locale parsed = Messages.normalize(rawLocale);
        if (parsed != null) {
            profiles.changeLocale(userId, parsed.getLanguage()).ifPresent(change ->
                    activity.record(activity.fromRequest("LOCALE_CHANGED")
                            .text("Язык: " + (change.before() == null ? "—" : change.before()) + " → " + change.after())
                            .detail("from", change.before()).detail("to", change.after())));
        }
    }
}
