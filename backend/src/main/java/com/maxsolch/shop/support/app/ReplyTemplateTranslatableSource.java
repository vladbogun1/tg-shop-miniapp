package com.maxsolch.shop.support.app;

import java.util.Collection;
import com.maxsolch.shop.support.domain.ReplyTemplate;
import java.util.Collection;
import com.maxsolch.shop.support.infra.ReplyTemplateRepository;
import java.util.Collection;
import com.maxsolch.shop.translation.app.TranslatableSource;
import java.util.Collection;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import java.util.Collection;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import java.util.Collection;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Collection;
import java.util.Map;
import java.util.Collection;
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

    /** The numeric template id sits in the low 8 bytes of the entity id (see {@code ReplyTemplate.translationId}). */
    @Override
    public Collection<byte[]> orphans(TranslationEntityType type, Collection<byte[]> ids) {
        Set<Long> existing = new java.util.HashSet<>();
        repository.findAll().forEach(t -> existing.add(t.getId()));
        return ids.stream().filter(id -> {
            Long templateId = ReplyTemplate.idOfTranslationId(id);
            return templateId == null || !existing.contains(templateId);
        }).toList();
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
