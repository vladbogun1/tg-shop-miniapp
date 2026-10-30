package com.maxsolch.shop.architecture;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The listeners of the order events ({@code OrderNotificationListener}) run after the commit of the publishing
 * transaction; an event published with no transaction around would be dropped if the listener did not run in that case
 * too. This test fixes the fact the choice relies on: every place in the modules {@code order}, {@code returns} and
 * {@code gift} that publishes a domain event is reached only through a {@code @Transactional} method (the method itself,
 * or every caller, up to one that is). A new publisher outside a transaction fails here instead of silently losing a
 * Telegram message.
 */
class OrderEventsPublishedInTransactionTest {

    private static final String TX = "org.springframework.transaction.annotation.Transactional";
    private static final Set<String> MODULES = Set.of("order", "returns", "gift");

    @Test
    void everyEventPublishedByOrderModulesHappensInsideATransaction() {
        JavaClasses classes = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.maxsolch.shop");
        Map<String, List<JavaCodeUnit>> callers = new HashMap<>();
        for (JavaClass c : classes) {
            for (JavaCodeUnit unit : units(c)) {
                for (JavaMethodCall call : unit.getMethodCallsFromSelf()) {
                    callers.computeIfAbsent(key(call.getTargetOwner(), call.getName(), call.getTarget().getRawParameterTypes()
                            .stream().map(JavaClass::getName).toList().toString()), k -> new ArrayList<>()).add(unit);
                }
            }
        }
        List<String> outside = new ArrayList<>();
        int publishers = 0;
        for (JavaClass c : classes) {
            if (!inModules(c)) {
                continue;
            }
            for (JavaCodeUnit unit : units(c)) {
                boolean publishes = unit.getMethodCallsFromSelf().stream().anyMatch(call ->
                        (call.getTargetOwner().getName().endsWith(".DomainEvents") && call.getName().equals("publish"))
                                || (call.getTargetOwner().getName().endsWith(".ApplicationEventPublisher")
                                && call.getName().equals("publishEvent")));
                if (publishes) {
                    publishers++;
                    if (!covered(unit, callers, new HashSet<>())) {
                        outside.add(c.getName() + "." + unit.getName());
                    }
                }
            }
        }
        assertThat(publishers).as("publishers found").isGreaterThan(20);
        assertThat(outside).as("event publishers reachable without a transaction").isEmpty();
    }

    private static boolean covered(JavaCodeUnit unit, Map<String, List<JavaCodeUnit>> callers, Set<String> seen) {
        if (unit.isAnnotatedWith(TX) || unit.getOwner().isAnnotatedWith(TX)) {
            return true;
        }
        if (!seen.add(unit.getFullName())) {
            return true; // a cycle adds no new entry point
        }
        List<JavaCodeUnit> in = new ArrayList<>();
        if (unit instanceof JavaMethod m) {
            String params = m.getRawParameterTypes().stream().map(JavaClass::getName).toList().toString();
            in.addAll(callers.getOrDefault(key(m.getOwner(), m.getName(), params), List.of()));
            for (JavaClass sup : m.getOwner().getAllRawSuperclasses()) {
                in.addAll(callers.getOrDefault(key(sup, m.getName(), params), List.of()));
            }
            for (JavaClass sup : m.getOwner().getAllRawInterfaces()) {
                in.addAll(callers.getOrDefault(key(sup, m.getName(), params), List.of()));
            }
        }
        if (unit.getName().startsWith("lambda$")) {
            // a lambda runs where the method that created it runs; the creator is not in the call graph, so the
            // class must have a transactional method to be trusted
            return lambdaOwnerCovered(unit);
        }
        return !in.isEmpty() && in.stream().allMatch(caller -> covered(caller, callers, seen));
    }

    private static boolean lambdaOwnerCovered(JavaCodeUnit lambda) {
        return lambda.getOwner().getMethods().stream().anyMatch(m -> m.isAnnotatedWith(TX));
    }

    private static List<JavaCodeUnit> units(JavaClass c) {
        List<JavaCodeUnit> units = new ArrayList<>(c.getMethods());
        units.addAll(c.getConstructors());
        return units;
    }

    private static String key(JavaClass owner, String name, String params) {
        return owner.getName() + "#" + name + params;
    }

    private static boolean inModules(JavaClass c) {
        String[] p = c.getPackageName().split("[.]");
        return p.length > 3 && MODULES.contains(p[3]);
    }
}
