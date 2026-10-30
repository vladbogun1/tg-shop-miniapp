package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.platform.cache.CacheConfig;
import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationsChanged;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.MessageFormat;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Bot phrases of the pre-order queue that the owner can edit in «Переводы» (entity type BOT_TEXT).
 *
 * <p>Source language is Russian, like every content translation: the source is messages_ru.properties
 * unless the owner saved a fix (kept as the system setting botText.ru.KEY). uk/en texts are rows of
 * content_translations (entity_id = MD5 of the key, field "body"). Resolution: the stored override first
 * (a translation counts only while its source hash matches the current Russian source, as everywhere in
 * «Переводы»), then the usual messages*.properties. Overrides are cached in memory and dropped when
 * «Переводы» saves ({@link #invalidate()}), so sending a message never hits the database.
 */
@Slf4j
@Component
public class BotTexts {

    /** The editable phrases: every key the PreorderNotifier uses. */
    public static final List<String> KEYS = List.of(
            "bot.preorder.subscribed", "bot.preorder.subscribedNotify", "bot.preorder.eta",
            "bot.preorder.held", "bot.preorder.heldPartial", "bot.preorder.arrived", "bot.preorder.ending",
            "bot.preorder.expired", "bot.preorder.stillWaiting", "bot.preorder.batchCancelled",
            "bot.preorder.batchCancelledKept", "bot.preorder.productGone", "bot.preorder.removed",
            "bot.preorder.btnBuy", "bot.preorder.btnMine", "bot.preorder.approxWeeks", "bot.preorder.soon");

    public static final int MAX_CHARS = 2000;
    private static final String RU_PREFIX = "botText.ru.";
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{(\\d+)}");

    private final Messages messages;
    private final SettingsService settings;
    private final TranslationService translations;

    private final Map<String, String> defaultsRu = new HashMap<>();
    /** The built-in texts of messages_uk / messages_en.properties, by language. */
    private final Map<String, Map<String, String>> builtin = new HashMap<>();
    private final Cache ruOverrides;

    public BotTexts(Messages messages, SettingsService settings, TranslationService translations, CacheManager caches) {
        this.ruOverrides = CacheConfig.require(caches, BotTextCaches.RU_OVERRIDES.name());
        this.messages = messages;
        this.settings = settings;
        this.translations = translations;
        for (String lang : List.of("ru", "uk", "en")) {
            Properties p = new Properties();
            try (var in = new InputStreamReader(
                    new ClassPathResource("i18n/messages_" + lang + ".properties").getInputStream(),
                    StandardCharsets.UTF_8)) {
                p.load(in);
            } catch (Exception e) {
                log.warn("cannot read messages_{}.properties: {}", lang, e.toString());
            }
            Map<String, String> target = "ru".equals(lang) ? defaultsRu : builtin.computeIfAbsent(lang, x -> new HashMap<>());
            for (String k : KEYS) {
                String v = p.getProperty(k);
                if (v != null) {
                    target.put(k, v);
                }
            }
        }
    }

    /** The Russian text shipped in messages_ru.properties (what the built-in uk/en were written from). */
    public String builtinRu(String key) {
        return defaultsRu.get(key);
    }

    /** The shipped text of a language (uk | en), or null. */
    public String builtin(String lang, String key) {
        Map<String, String> m = builtin.get(lang);
        return m == null ? null : m.get(key);
    }

    // ------------------------------------------------------------------ identity

    /** Stable entity id of a phrase: MD5(key), exactly 16 bytes. */
    public static byte[] idOf(String key) {
        try {
            return MessageDigest.getInstance("MD5").digest(key.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static String idStringOf(String key) {
        return UuidUtil.toString(idOf(key));
    }

    /** The phrase key behind an entity id, or null. */
    public static String keyOfId(byte[] id) {
        for (String k : KEYS) {
            if (Arrays.equals(idOf(k), id)) {
                return k;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------ sources

    /** The Russian source as the owner sees it: his fix if any, else the properties text. Null for unknown keys. */
    public String sourceRu(String key) {
        String o = overrides().get(key);
        return o != null ? o : defaultsRu.get(key);
    }

    /** Placeholders ({0}, {1}...) a text uses. */
    public static Set<String> placeholders(String text) {
        Set<String> out = new TreeSet<>();
        Matcher m = PLACEHOLDER.matcher(text == null ? "" : text);
        while (m.find()) {
            out.add(m.group(1));
        }
        return out;
    }

    /**
     * Saves a fixed Russian source. Returns false when the key is unknown, the text is blank/too long or
     * its placeholders differ from the original (the code passes fixed arguments).
     */
    public boolean saveRu(String key, String text) {
        String base = defaultsRu.get(key);
        if (base == null || text == null || text.isBlank() || text.length() > MAX_CHARS
                || !placeholders(base).equals(placeholders(text))) {
            return false;
        }
        settings.putSystem(RU_PREFIX + key, text.equals(base) ? "" : text);
        invalidate();
        return true;
    }

    public void invalidate() {
        ruOverrides.clear();
        translations.invalidate();
    }

    @OnCommitted
    void onTranslationsChanged(TranslationsChanged event) {
        ruOverrides.clear();
    }

    private Map<String, String> overrides() {
        @SuppressWarnings("unchecked")
        Map<String, String> m = ruOverrides.get(BotTextCaches.KEY, Map.class);
        if (m == null) {
            m = new HashMap<>();
            for (String k : KEYS) {
                try {
                    String v = settings.system(RU_PREFIX + k).orElse("");
                    if (!v.isBlank()) {
                        m.put(k, v);
                    }
                } catch (Exception e) {
                    log.debug("bot text override read failed for {}: {}", k, e.toString());
                }
            }
            ruOverrides.put(BotTextCaches.KEY, m);
        }
        return m;
    }

    // ------------------------------------------------------------------ resolution

    /** The edited template for a language, or null to use the properties. */
    String overrideFor(Locale locale, String key) {
        String lang = locale == null ? "" : locale.getLanguage();
        if ("ru".equals(lang)) {
            return overrides().get(key);
        }
        String source = sourceRu(key);
        if (source == null) {
            return null;
        }
        var entry = translations.snapshot(lang).get(
                new TranslationService.Key(TranslationEntityType.BOT_TEXT, idStringOf(key), TranslationEntityType.BODY));
        if (entry == null || !entry.sourceHash().equals(SourceHash.sha256Hex(source))
                || !placeholders(entry.text()).equals(placeholders(source))) {
            return null;
        }
        return entry.text();
    }

    /** Like {@link Messages#get}, but the owner's edited text wins over the properties. */
    public String get(Locale locale, String key, Object... args) {
        String template = null;
        try {
            template = overrideFor(locale, key);
        } catch (Exception e) {
            log.debug("bot text override failed for {}: {}", key, e.toString());
        }
        if (template == null) {
            return messages.get(locale, key, args);
        }
        try {
            // a lone apostrophe would swallow the placeholders after it in MessageFormat
            return new MessageFormat(template.replace("'", "''"), locale).format(args);
        } catch (Exception e) {
            log.warn("bad override for '{}' ({}), using the default", key, e.toString());
            return messages.get(locale, key, args);
        }
    }
}
