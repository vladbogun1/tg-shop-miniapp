package com.maxsolch.shop.i18n;

import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationOrigin;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.translation.TranslationService.Entry;
import com.maxsolch.shop.translation.TranslationService.Key;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The owner's edits of the bot phrases win over messages*.properties; stale or broken ones are ignored. */
class BotTextsTest {

    static final String KEY = "bot.preorder.arrived";
    static final Locale RU = Locale.forLanguageTag("ru");
    static final Locale UK = Locale.forLanguageTag("uk");
    static final Locale EN = Locale.forLanguageTag("en");

    final Map<String, String> store = new HashMap<>();
    final Map<Key, Entry> uk = new HashMap<>();
    SettingsService settings = mock(SettingsService.class);
    TranslationService translations = mock(TranslationService.class);
    BotTexts texts;

    @BeforeEach
    void setUp() {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("i18n/messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        Messages messages = new Messages(source, mock(UserRepository.class));
        when(settings.system(anyString())).thenAnswer(inv -> Optional.ofNullable(store.get((String) inv.getArgument(0))));
        org.mockito.Mockito.doAnswer(inv -> {
            store.put(inv.getArgument(0), inv.getArgument(1));
            return null;
        }).when(settings).putSystem(anyString(), anyString());
        when(translations.snapshot("uk")).thenReturn(uk);
        when(translations.snapshot("en")).thenReturn(Map.of());
        texts = new BotTexts(messages, settings, translations);
    }

    private void translate(String text, String sourceRu) {
        uk.put(new Key(TranslationEntityType.BOT_TEXT, BotTexts.idStringOf(KEY), TranslationEntityType.BODY),
                new Entry(text, TranslationService.sha256Hex(sourceRu), TranslationOrigin.MANUAL));
    }

    @Test
    void withoutOverridesThePropertiesAreUsed() {
        String ru = texts.get(RU, KEY, "Lamzu");

        assertThat(ru).contains("Lamzu").contains("Приехало");
        assertThat(texts.sourceRu(KEY)).contains("{0}");
    }

    @Test
    void anEditedRussianSourceOverridesRuAndOnlyRu() {
        assertThat(texts.saveRu(KEY, "Ура, {0} приехал!")).isTrue();

        assertThat(texts.get(RU, KEY, "Lamzu")).isEqualTo("Ура, Lamzu приехал!");
        assertThat(texts.get(EN, KEY, "Lamzu")).contains("arrived");
    }

    @Test
    void aCurrentTranslationWinsOverTheProperties() {
        translate("Є! {0} вже тут", texts.sourceRu(KEY));

        assertThat(texts.get(UK, KEY, "Lamzu")).isEqualTo("Є! Lamzu вже тут");
    }

    @Test
    void aTranslationOfAnOlderSourceIsIgnoredAfterTheSourceChanged() {
        translate("Є! {0} вже тут", texts.sourceRu(KEY));
        texts.saveRu(KEY, "Новый текст {0}");

        assertThat(texts.get(UK, KEY, "Lamzu")).doesNotContain("Є!");
    }

    @Test
    void aTranslationThatLostAPlaceholderIsIgnored() {
        translate("Вже тут", texts.sourceRu(KEY));

        assertThat(texts.get(UK, KEY, "Lamzu")).contains("Lamzu");
    }

    @Test
    void aSourceWithOtherPlaceholdersOrUnknownKeyIsRefused() {
        assertThat(texts.saveRu(KEY, "Без названия")).isFalse();
        assertThat(texts.saveRu(KEY, "{0} и {1}")).isFalse();
        assertThat(texts.saveRu("bot.nothing", "{0}")).isFalse();
        assertThat(texts.saveRu(KEY, " ")).isFalse();
    }

    @Test
    void savingTheOriginalTextClearsTheOverride() {
        String original = texts.sourceRu(KEY);
        texts.saveRu(KEY, "Другое {0}");
        texts.saveRu(KEY, original);

        assertThat(texts.sourceRu(KEY)).isEqualTo(original);
    }

    @Test
    void anApostropheDoesNotSwallowThePlaceholders() {
        texts.saveRu(KEY, "It's here: {0}");

        assertThat(texts.get(RU, KEY, "Lamzu")).isEqualTo("It's here: Lamzu");
    }

    @Test
    void everyKeyHasARussianSourceAndAStableDistinctId() {
        assertThat(BotTexts.KEYS).allSatisfy(k -> assertThat(texts.sourceRu(k)).as(k).isNotBlank());
        assertThat(BotTexts.KEYS.stream().map(BotTexts::idStringOf).distinct()).hasSameSizeAs(BotTexts.KEYS);
        assertThat(BotTexts.keyOfId(BotTexts.idOf(KEY))).isEqualTo(KEY);
    }
}
