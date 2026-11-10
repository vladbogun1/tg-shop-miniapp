package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.domain.TranslationEntityType;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.EnumSet;
import java.util.Set;

/**
 * Background auto-translation ({@code app.translations.auto.*}). It runs only when the translator has a key.
 *
 * <ul>
 *   <li>{@code reserve-chars} — characters of the monthly limit left untouched (a margin for a hand-run batch);</li>
 *   <li>{@code max-chars-per-run} — one run sends at most this many characters (a mass edit spreads over runs);</li>
 *   <li>{@code skip-types} — types never translated automatically: bot phrases have hand-written uk/en shipped in
 *       {@code messages_*.properties}, a machine text would replace them.</li>
 * </ul>
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app.translations.auto")
public class AutoTranslationProperties {

    private boolean enabled = true;
    private long reserveChars = 20_000;
    private long maxCharsPerRun = 100_000;
    private Set<TranslationEntityType> skipTypes = EnumSet.of(TranslationEntityType.BOT_TEXT);
}
