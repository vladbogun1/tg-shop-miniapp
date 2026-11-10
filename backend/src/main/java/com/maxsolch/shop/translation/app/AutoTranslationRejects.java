package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.settings.app.SettingsService;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Texts whose machine translation came back unusable (a lost number, Russian letters in Ukrainian…), so the
 * auto-translation does not send and bill them again every run. Kept in the database (a system setting), so a restart or
 * a second backend during a deploy does not resend them either. An entry is {@code locale:} + the start of the source
 * hash; a changed Russian text has another hash and is tried again. At most {@link #MAX} entries, the oldest go first.
 */
@Component
class AutoTranslationRejects {

    static final String KEY = "translations.auto.rejected";
    static final int MAX = 2_000;
    private static final int HASH_PREFIX = 16;

    private final SettingsService settings;

    AutoTranslationRejects(SettingsService settings) {
        this.settings = settings;
    }

    static String mark(String locale, String hash) {
        return locale + ":" + hash.substring(0, HASH_PREFIX);
    }

    Set<String> load() {
        String raw = settings.system(KEY).orElse("");
        Set<String> out = new LinkedHashSet<>();
        Arrays.stream(raw.split(",")).map(String::trim).filter(s -> !s.isEmpty()).forEach(out::add);
        return out;
    }

    void add(Collection<String> marks) {
        if (marks.isEmpty()) {
            return;
        }
        Set<String> all = load();
        all.addAll(marks);
        List<String> list = new ArrayList<>(all);
        if (list.size() > MAX) {
            list = list.subList(list.size() - MAX, list.size());
        }
        settings.putSystem(KEY, String.join(",", list));
    }
}
