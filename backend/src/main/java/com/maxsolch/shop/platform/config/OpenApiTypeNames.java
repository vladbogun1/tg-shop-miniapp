package com.maxsolch.shop.platform.config;

import io.swagger.v3.core.jackson.TypeNameResolver;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.type.classreading.CachingMetadataReaderFactory;
import org.springframework.core.type.classreading.MetadataReader;

import java.io.IOException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Schema names for the OpenAPI document. A schema is named by the simple name of its class, and several
 * records of the app share one ({@code MessageDto} of the order chat and of support, a dozen nested {@code Item},
 * {@code Line}, {@code Result}): springdoc keeps ONE schema per name, so one of them silently replaced the others
 * and the generated TypeScript lied. A simple name used by more than one record is therefore made unique by the
 * module and the enclosing class: {@code SupportMessageDto}, {@code OrderCreateOrderRequestItem}.
 */
public final class OpenApiTypeNames extends TypeNameResolver {

    private static final String BASE = "com.maxsolch.shop";

    private static final class Holder {
        static final Set<String> AMBIGUOUS = ambiguousSimpleNames();
    }

    @Override
    protected String nameForClass(Class<?> cls, Set<Options> options) {
        return nameOf(cls);
    }

    /** The schema name of a record class (also used by the test that no two classes end up with the same one). */
    public static String nameOf(Class<?> cls) {
        String simple = cls.getSimpleName();
        if (!cls.isRecord() || !cls.getName().startsWith(BASE + ".") || !Holder.AMBIGUOUS.contains(simple)) {
            return simple;
        }
        String[] parts = cls.getName().substring(BASE.length() + 1).split("\\.");
        String module = parts[0];
        StringBuilder name = new StringBuilder(String.valueOf(Character.toUpperCase(module.charAt(0)))).append(module.substring(1));
        Class<?> outer = cls.getEnclosingClass();
        if (outer != null && !outer.getSimpleName().endsWith("Dtos")) {
            name.append(outer.getSimpleName());
        }
        return name.append(simple).toString();
    }

    private static Set<String> ambiguousSimpleNames() {
        Map<String, Integer> count = new HashMap<>();
        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            CachingMetadataReaderFactory readers = new CachingMetadataReaderFactory(resolver);
            for (Resource r : resolver.getResources("classpath*:com/maxsolch/shop/**/*.class")) {
                MetadataReader reader = readers.getMetadataReader(r);
                if ("java.lang.Record".equals(reader.getClassMetadata().getSuperClassName())) {
                    String name = reader.getClassMetadata().getClassName();
                    count.merge(name.substring(Math.max(name.lastIndexOf('.'), name.lastIndexOf('$')) + 1), 1, Integer::sum);
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("cannot scan the DTO records for the OpenAPI schema names", e);
        }
        Set<String> out = new HashSet<>();
        count.forEach((name, n) -> {
            if (n > 1) {
                out.add(name);
            }
        });
        return out;
    }
}
