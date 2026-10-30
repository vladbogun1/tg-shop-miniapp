package com.maxsolch.shop.platform.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import org.springdoc.core.customizers.OpenApiCustomizer;

import java.util.ArrayDeque;
import java.util.Collection;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Applies the "required / nullable" facts left by {@link OpenApiRecordSchemas} to the schemas a response carries.
 *
 * <p>A schema reachable from a response body says exactly what the JSON has: every component present
 * ({@code required}), a {@code @Nullable} one possibly {@code null}. A schema used only as a request body keeps
 * springdoc's own reading of {@code @NotNull} / {@code @NotBlank}: a client may leave out what the server defaults.
 */
public final class OpenApiResponseSchemas implements OpenApiCustomizer {

    @Override
    @SuppressWarnings({"rawtypes", "unchecked"})
    public void customise(OpenAPI openApi) {
        if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
            return;
        }
        Map<String, Schema> schemas = openApi.getComponents().getSchemas();
        schemas.values().forEach(OpenApiResponseSchemas::openUpAnyValues);
        Set<String> inResponses = reachable(schemas, responseSchemas(openApi));
        for (Map.Entry<String, Schema> e : schemas.entrySet()) {
            Schema model = e.getValue();
            if (model.getExtensions() == null) {
                continue;
            }
            Object ext = model.getExtensions().remove(OpenApiRecordSchemas.RESPONSE_EXTENSION);
            if (model.getExtensions().isEmpty()) {
                model.setExtensions(null);
            }
            if (ext instanceof Map<?, ?> facts && inResponses.contains(e.getKey())) {
                List<String> required = (List<String>) facts.get("required");
                List<String> nullable = (List<String>) facts.get("nullable");
                model.setRequired(required.isEmpty() ? null : required);
                Map<String, Schema> props = model.getProperties();
                for (String name : nullable) {
                    props.put(name, nullable(props.get(name)));
                }
            }
        }
    }

    /**
     * A free-form value ({@code Object}, the values of a {@code Map<String, Object>}) is read by springdoc as
     * {@code {type: object}} with no properties, which the TypeScript generator turns into {@code Record<string, never>}:
     * nothing can be read from it. It is "any JSON value" ({@code {}} → {@code unknown}), and a client narrows it itself.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private static void openUpAnyValues(Schema s) {
        if (s == null) {
            return;
        }
        if ("object".equals(s.getType()) && s.getProperties() == null && s.getAdditionalProperties() == null
                && s.get$ref() == null && s.getAllOf() == null && s.getOneOf() == null && s.getAnyOf() == null
                && s.getEnum() == null) {
            s.setType(null);
            return;
        }
        openUpAnyValues(s.getItems());
        if (s.getAdditionalProperties() instanceof Schema inner) {
            openUpAnyValues(inner);
        }
        if (s.getProperties() != null) {
            ((Collection<Schema>) s.getProperties().values()).forEach(OpenApiResponseSchemas::openUpAnyValues);
        }
    }

    /** OpenAPI 3.0 ignores siblings of a {@code $ref}, so a nullable reference is wrapped in a one-element allOf. */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private static Schema nullable(Schema prop) {
        if (prop.get$ref() != null) {
            return new Schema<>().allOf(List.of(prop)).nullable(true);
        }
        prop.setNullable(true);
        return prop;
    }

    @SuppressWarnings("rawtypes")
    private static Set<String> responseSchemas(OpenAPI openApi) {
        Set<String> out = new HashSet<>();
        if (openApi.getPaths() == null) {
            return out;
        }
        for (PathItem item : openApi.getPaths().values()) {
            for (Operation op : item.readOperations()) {
                if (op.getResponses() == null) {
                    continue;
                }
                for (ApiResponse r : op.getResponses().values()) {
                    Content content = r.getContent();
                    if (content != null) {
                        content.values().forEach(m -> collectRefs(m.getSchema(), out));
                    }
                }
            }
        }
        return out;
    }

    /** Schema names a schema mentions directly: a {@code $ref}, items, properties, allOf/oneOf/anyOf, map values. */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private static void collectRefs(Schema s, Set<String> out) {
        if (s == null) {
            return;
        }
        if (s.get$ref() != null) {
            out.add(s.get$ref().substring(s.get$ref().lastIndexOf('/') + 1));
        }
        collectRefs(s.getItems(), out);
        if (s.getAdditionalProperties() instanceof Schema inner) {
            collectRefs(inner, out);
        }
        if (s.getProperties() != null) {
            ((Collection<Schema>) s.getProperties().values()).forEach(p -> collectRefs(p, out));
        }
        for (List<Schema> group : new List[] {s.getAllOf(), s.getOneOf(), s.getAnyOf()}) {
            if (group != null) {
                group.forEach(p -> collectRefs(p, out));
            }
        }
    }

    @SuppressWarnings("rawtypes")
    private static Set<String> reachable(Map<String, Schema> schemas, Set<String> roots) {
        Set<String> seen = new HashSet<>();
        Deque<String> todo = new ArrayDeque<>(roots);
        while (!todo.isEmpty()) {
            String name = todo.pop();
            if (!seen.add(name) || schemas.get(name) == null) {
                continue;
            }
            Set<String> next = new HashSet<>();
            collectRefs(schemas.get(name), next);
            todo.addAll(next);
        }
        return seen;
    }
}
