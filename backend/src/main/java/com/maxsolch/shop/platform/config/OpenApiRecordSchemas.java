package com.maxsolch.shop.platform.config;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.type.TypeFactory;
import io.swagger.v3.core.converter.AnnotatedType;
import io.swagger.v3.core.converter.ModelConverter;
import io.swagger.v3.core.converter.ModelConverterContext;
import io.swagger.v3.oas.models.media.Schema;

import java.lang.reflect.AnnotatedElement;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Reads what a DTO record promises, so the front-end types generated from the schema are as strict as the Java.
 *
 * <p>springdoc alone calls every property optional ({@code field?: T}), which would make the front-ends unable
 * to notice a vanished field. The JSON of a record always carries every component (nothing in the app sets a
 * global {@code NON_NULL}), so for a record that goes out in a response:
 * <ul>
 *   <li>every component is {@code required}, unless the record or the component is
 *       {@code @JsonInclude(NON_NULL / NON_EMPTY)} - then the key may be missing (optional, not nullable);</li>
 *   <li>a component annotated {@code @Nullable} may be {@code null} ({@code nullable: true}); an unannotated
 *       one never is.</li>
 * </ul>
 * This converter only records those facts in an extension; {@link OpenApiResponseSchemas} applies them to the
 * schemas reachable from a response. Only the schema changes, never the JSON the API sends.
 */
public final class OpenApiRecordSchemas implements ModelConverter {

    /** Where {@link #resolve} leaves what a schema must look like as a response; {@link OpenApiResponseSchemas} applies it. */
    static final String RESPONSE_EXTENSION = "x-response";

    @Override
    @SuppressWarnings("rawtypes")
    public Schema resolve(AnnotatedType type, ModelConverterContext context, Iterator<ModelConverter> chain) {
        Schema resolved = chain.hasNext() ? chain.next().resolve(type, context, chain) : null;
        if (resolved == null) {
            return null;
        }
        Class<?> raw = TypeFactory.defaultInstance().constructType(type.getType()).getRawClass();
        if (!raw.isRecord()) {
            return resolved;
        }
        Schema model = resolved;
        if (resolved.get$ref() != null) {
            String name = resolved.get$ref().substring(resolved.get$ref().lastIndexOf('/') + 1);
            model = context.getDefinedModels().get(name);
        }
        if (model != null && model.getProperties() != null) {
            strengthen(raw, model);
        }
        return resolved;
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private static void strengthen(Class<?> record, Schema model) {
        boolean classOptional = omitsNull(record);
        List<String> required = new ArrayList<>();
        List<String> nullable = new ArrayList<>();
        for (String property : ((Map<String, Schema>) model.getProperties()).keySet()) {
            RecordComponent component = componentFor(record, property);
            boolean optional = classOptional || (component != null && omitsNull(fieldOf(record, component)));
            if (!optional) {
                required.add(property);
            }
            if (component != null && isNullable(record, component)) {
                nullable.add(property);
            }
        }
        required.sort(String::compareTo);
        nullable.sort(String::compareTo);
        model.addExtension(RESPONSE_EXTENSION, Map.of("required", required, "nullable", nullable));
    }

    private static boolean isNullable(Class<?> record, RecordComponent c) {
        return hasNullable(fieldOf(record, c)) || hasNullable(c.getAccessor()) || hasNullable(c);
    }

    private static boolean hasNullable(AnnotatedElement e) {
        if (e == null) {
            return false;
        }
        for (var a : e.getAnnotations()) {
            if (a.annotationType().getSimpleName().equals("Nullable")) {
                return true;
            }
        }
        return false;
    }

    private static boolean omitsNull(AnnotatedElement e) {
        if (e == null) {
            return false;
        }
        JsonInclude include = e.getAnnotation(JsonInclude.class);
        return include != null && (include.value() == JsonInclude.Include.NON_NULL
                || include.value() == JsonInclude.Include.NON_EMPTY || include.value() == JsonInclude.Include.NON_ABSENT);
    }

    private static Field fieldOf(Class<?> record, RecordComponent c) {
        try {
            return record.getDeclaredField(c.getName());
        } catch (NoSuchFieldException e) {
            return null;
        }
    }

    /** The component whose JSON name (own name or {@code @JsonProperty}) is {@code jsonName}. */
    private static RecordComponent componentFor(Class<?> record, String jsonName) {
        for (RecordComponent c : record.getRecordComponents()) {
            Method accessor = c.getAccessor();
            JsonProperty p = accessor.getAnnotation(JsonProperty.class);
            if (p == null) {
                Field f = fieldOf(record, c);
                p = f == null ? null : f.getAnnotation(JsonProperty.class);
            }
            String name = p != null && !p.value().isEmpty() ? p.value() : c.getName();
            if (name.equals(jsonName)) {
                return c;
            }
        }
        return null;
    }
}
