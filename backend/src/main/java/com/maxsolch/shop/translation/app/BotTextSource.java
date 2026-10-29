package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/** Bot phrases of the pre-order queue: the key is the context, the source is the Russian text. */
@Component
class BotTextSource implements TranslatableSource {

    private final BotTexts botTexts;

    BotTextSource(BotTexts botTexts) {
        this.botTexts = botTexts;
    }

    @Override
    public Set<TranslationEntityType> types() {
        return Set.of(TranslationEntityType.BOT_TEXT);
    }

    @Override
    public Map<Key, Field> fields() {
        Map<Key, Field> out = new HashMap<>();
        for (String key : BotTexts.KEYS) {
            String ru = botTexts.sourceRu(key);
            if (ru != null) {
                out.put(new Key(TranslationEntityType.BOT_TEXT, BotTexts.idStringOf(key), TranslationEntityType.BODY),
                        new Field(ru, true, null, key));
            }
        }
        return out;
    }

    @Override
    public String applySource(SourceChange change) {
        String key = BotTexts.keyOfId(change.entityId());
        String current = key == null ? null : botTexts.sourceRu(key);
        if (current == null) {
            return "NOT_FOUND";
        }
        if (!change.holds(current)) {
            return "STALE";
        }
        return botTexts.saveRu(key, change.newSource()) ? "OK" : "INVALID_PLACEHOLDERS";
    }

    @Override
    public Integer maxSourceChars(TranslationEntityType type, String field) {
        return BotTexts.MAX_CHARS;
    }
}
