package com.maxsolch.shop.translation.domain;

import java.util.List;

/**
 * A machine translation service (DeepL today) that the background auto-translation sends Russian sources to. The
 * module asks only two things of it: how many characters are left this period and the translations of a list of
 * texts into one language. Another provider (a local model, another API) is another implementation in {@code infra}.
 */
public interface MachineTranslator {

    /** A key is set; without it the auto-translation does nothing. */
    boolean configured();

    /** Characters used and allowed in the current billing period of the provider. */
    Usage usage() throws MachineTranslationException;

    /**
     * Translations of {@code texts} from Russian into {@code locale} (uk | en), in the same order and of the same size.
     *
     * @param context text that helps the provider (the glossary); not translated and not billed
     */
    List<String> translate(List<String> texts, String locale, String context) throws MachineTranslationException;

    /** The limit of one call: texts per request and characters per request. */
    int maxTextsPerCall();

    int maxCharsPerCall();

    record Usage(long used, long limit) {

        public long remaining() {
            return Math.max(0, limit - used);
        }
    }
}
