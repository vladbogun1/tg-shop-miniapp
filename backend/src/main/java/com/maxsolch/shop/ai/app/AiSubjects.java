package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.SubjectFields;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The objects an AI task can be about, by kind: every module that has such objects supplies a {@link SubjectFields}. */
@Service
public class AiSubjects {

    private final Map<String, SubjectFields> byType = new HashMap<>();

    public AiSubjects(List<SubjectFields> ports) {
        ports.forEach(p -> byType.put(p.subjectType(), p));
    }

    public SubjectFields of(String subjectType) {
        SubjectFields port = byType.get(subjectType);
        if (port == null) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "subjectType");
        }
        return port;
    }
}
