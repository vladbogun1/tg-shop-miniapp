package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.SubjectFields;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** The objects an AI task can be about, by kind: every module that has such objects supplies a {@link SubjectFields}. */
@Service
public class AiSubjects {

    private final Map<String, SubjectFields> byType = new HashMap<>();

    public AiSubjects(List<SubjectFields> ports) {
        ports.forEach(p -> byType.put(p.subjectType(), p));
    }

    /** The port of the kind, or empty when no module serves it (a translation batch, an invoice). */
    public Optional<SubjectFields> find(String subjectType) {
        return Optional.ofNullable(byType.get(subjectType));
    }

    public SubjectFields of(String subjectType) {
        SubjectFields port = byType.get(subjectType);
        if (port == null) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "subjectType");
        }
        return port;
    }
}
