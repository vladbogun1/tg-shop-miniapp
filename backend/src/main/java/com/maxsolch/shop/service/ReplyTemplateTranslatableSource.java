package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.ReplyTemplate;
import com.maxsolch.shop.repository.ReplyTemplateRepository;
import com.maxsolch.shop.translation.app.TranslatableSource;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * Chat reply templates: admin-only texts, always in scope; the template title is the context
 * shown next to the text on the translations screen and in the AI prompt.
 */
@Component
public class ReplyTemplateTranslatableSource implements TranslatableSource {

    private final ReplyTemplateRepository repository;

    public ReplyTemplateTranslatableSource(ReplyTemplateRepository repository) {
        this.repository = repository;
    }

    @Override
    public Set<TranslationEntityType> types() {
        return Set.of(TranslationEntityType.REPLY_TEMPLATE);
    }

    @Override
    public Map<Key, Field> fields() {
        Map<Key, Field> out = new HashMap<>();
        for (ReplyTemplate t : repository.findAll()) {
            out.put(new Key(TranslationEntityType.REPLY_TEMPLATE, ReplyTemplate.translationKey(t.getId()),
                    TranslationEntityType.BODY), new Field(t.getBodyRu(), true, null, t.getTitle()));
        }
        return out;
    }

    @Override
    public String applySource(SourceChange c) {
        Long templateId = ReplyTemplate.idOfTranslationId(c.entityId());
        ReplyTemplate t = templateId == null ? null : repository.findById(templateId).orElse(null);
        if (t == null) {
            return "NOT_FOUND";
        }
        if (!c.holds(t.getBodyRu())) {
            return "STALE";
        }
        t.setBodyRu(c.newSource());
        return "OK";
    }

    @Override
    public Integer maxSourceChars(TranslationEntityType type, String field) {
        return ReplyTemplateDtos.BODY_MAX_CHARS;
    }
}
