package com.maxsolch.shop.architecture;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every event listener of the backend with the semantics that matter: which event, in which transaction phase,
 * whether it also runs when the event was published outside a transaction ({@code fallbackExecution}) and whether it
 * opens its own transaction. Moving a listener to another annotation or another event class must not change a line
 * unless the change is meant: then the snapshot is edited by hand in the same commit, with the reason in the message.
 * The event type is shown by its simple name, so moving an event between packages does not touch the snapshot.
 */
class EventListenersSnapshotTest {

    private static final Path SNAPSHOT = Path.of("src/test/resources/snapshots/events/listeners.txt");

    @Test
    void listenersKeepTheirPhaseAndFallback() throws Exception {
        List<String> actual = listeners();
        if (Boolean.getBoolean("snapshot.update")) {
            Files.writeString(SNAPSHOT, String.join("\n", actual) + "\n", StandardCharsets.UTF_8);
            return;
        }
        assertThat(actual).containsExactlyElementsOf(Files.readAllLines(SNAPSHOT, StandardCharsets.UTF_8));
    }

    private static List<String> listeners() throws ClassNotFoundException {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Component.class));
        List<String> lines = new ArrayList<>();
        for (var bd : scanner.findCandidateComponents("com.maxsolch.shop")) {
            Class<?> type = Class.forName(bd.getBeanClassName());
            for (Method m : type.getDeclaredMethods()) {
                TransactionalEventListener tx = AnnotatedElementUtils.findMergedAnnotation(m, TransactionalEventListener.class);
                EventListener plain = AnnotatedElementUtils.findMergedAnnotation(m, EventListener.class);
                if (plain == null) {
                    continue;
                }
                Transactional t = AnnotatedElementUtils.findMergedAnnotation(m, Transactional.class);
                String own = t == null ? "" : " tx=" + t.propagation();
                String event = m.getParameterCount() == 1 ? m.getParameterTypes()[0].getSimpleName()
                        : Arrays.stream(plain.classes()).map(Class::getSimpleName).collect(Collectors.joining("|"));
                if (m.getParameterCount() == 0 && plain.classes().length > 0) {
                    event = Arrays.stream(plain.classes()).map(Class::getSimpleName).collect(Collectors.joining("|"));
                }
                String kind = tx == null ? "immediately" : "phase=" + tx.phase() + " fallback=" + tx.fallbackExecution();
                lines.add(type.getSimpleName() + "." + m.getName() + "(" + event + ") " + kind + own);
            }
        }
        return lines.stream().sorted().toList();
    }
}
