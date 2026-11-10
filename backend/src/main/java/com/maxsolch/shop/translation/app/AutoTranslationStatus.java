package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.domain.MachineTranslationException;
import com.maxsolch.shop.translation.domain.MachineTranslator;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;

/** The line «Автоперевод» of the translations screen: on or off, the characters of the month, the last run. */
@Service
public class AutoTranslationStatus {

    /**
     * @param configured the translator has a key
     * @param used       characters spent this period, null when the translator did not answer
     * @param limit      characters allowed this period, null when unknown
     * @param lastRun    null before the first run after a start
     */
    public record AutoTranslationView(boolean configured, boolean enabled, @Nullable Long used, @Nullable Long limit,
                                      long reserve, @Nullable AutoTranslation.AutoTranslationLastRun lastRun) {
    }

    private final MachineTranslator translator;
    private final AutoTranslation auto;
    private final AutoTranslationProperties props;

    AutoTranslationStatus(MachineTranslator translator, AutoTranslation auto, AutoTranslationProperties props) {
        this.translator = translator;
        this.auto = auto;
        this.props = props;
    }

    public AutoTranslationView view() {
        Long used = null;
        Long limit = null;
        if (translator.configured()) {
            try {
                MachineTranslator.Usage u = translator.usage();
                used = u.used();
                limit = u.limit();
            } catch (MachineTranslationException e) {
                // shown as «нет ответа»: the screen must open even when DeepL does not answer
            }
        }
        return new AutoTranslationView(translator.configured(), props.isEnabled(), used, limit, props.getReserveChars(),
                auto.lastRun());
    }
}
