package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.ApplyDiff;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.SubjectEditors;
import com.maxsolch.shop.ai.domain.SubjectFields;
import org.springframework.stereotype.Service;

import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * «Пока работал ИИ, карточку правил Иван»: the snapshot of the object's fields taken when a job is created (stored with
 * the prompt, V92) and, for the review of a finished job, what differs from it now and who edited the object since
 * the start. The server decides it, so the review shows the same on any device; the browser no longer keeps a copy.
 * A retry keeps the snapshot of the job it repeats — its prompt was built from that state of the card.
 */
@Service
public class AiSubjectChanges {

    private static final TypeReference<LinkedHashMap<String, String>> FIELDS = new TypeReference<>() {
    };

    private final AiSubjects subjects;
    private final Map<String, SubjectEditors> editors = new HashMap<>();
    private final ObjectMapper mapper;

    public AiSubjectChanges(AiSubjects subjects, List<SubjectEditors> editorPorts, ObjectMapper mapper) {
        this.subjects = subjects;
        editorPorts.forEach(p -> editors.put(p.subjectType(), p));
        this.mapper = mapper;
    }

    /** JSON of the object's fields now; null when no module serves the kind or there is no such object. */
    String snapshot(String subjectType, String subjectId) {
        Optional<SubjectFields> port = subjects.find(subjectType);
        if (port.isEmpty()) {
            return null;
        }
        Optional<Map<String, String>> fields = port.get().find(subjectId);
        try {
            return fields.isEmpty() ? null : mapper.writeValueAsString(fields.get());
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /**
     * What changed in the object since the start of a finished, not yet handled job; null when there is nothing to
     * protect (no snapshot — an old job or a purged one, the result already applied or rejected, the job has no result).
     */
    AiJobDto.SubjectChanges since(AiJob job, String snapshotJson) {
        if (snapshotJson == null || job.getStatus() != JobStatus.DONE || job.getOutcome() != null) {
            return null;
        }
        Optional<SubjectFields> port = subjects.find(job.getSubjectType());
        Map<String, String> start = read(snapshotJson);
        if (port.isEmpty() || start == null) {
            return null;
        }
        Optional<Map<String, String>> now = port.get().find(job.getSubjectId());
        if (now.isEmpty()) {
            return null;
        }
        List<AiJobDto.Change> fields = ApplyDiff.diff(start, now.get()).entrySet().stream()
                .map(e -> new AiJobDto.Change(e.getKey(), e.getValue().before(), e.getValue().after())).toList();
        return new AiJobDto.SubjectChanges(fields, fields.isEmpty() ? List.of() : editors(job));
    }

    /** The audit keeps whole seconds: an edit in the second of the start counts as made after it. */
    private List<AiJobDto.Editor> editors(AiJob job) {
        SubjectEditors port = editors.get(job.getSubjectType());
        if (port == null) {
            return List.of();
        }
        return port.since(job.getSubjectId(), job.getCreatedAt().truncatedTo(ChronoUnit.SECONDS)).stream()
                .map(e -> new AiJobDto.Editor(e.who(), e.at())).toList();
    }

    private Map<String, String> read(String json) {
        try {
            return mapper.readValue(json, FIELDS);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
