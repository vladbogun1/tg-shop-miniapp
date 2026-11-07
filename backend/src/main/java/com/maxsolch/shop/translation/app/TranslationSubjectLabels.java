package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.ai.domain.SubjectLabels;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

/** Names the parts of translation tasks for the task center: «Перевод, часть 2» (the id is {@code "<part>-<hash>"}). */
@Component
public class TranslationSubjectLabels implements SubjectLabels {

    @Override
    public String subjectType() {
        return AiTranslationJobs.SUBJECT;
    }

    @Override
    public Map<String, String> labels(Collection<String> subjectIds) {
        Map<String, String> out = new HashMap<>();
        for (String id : subjectIds) {
            int dash = id.indexOf('-');
            if (dash > 0) {
                out.put(id, "Перевод, часть " + id.substring(0, dash));
            }
        }
        return out;
    }
}
