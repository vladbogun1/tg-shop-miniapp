package com.maxsolch.shop.architecture;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import com.tngtech.archunit.library.dependencies.Slice;

import java.util.ArrayDeque;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * Reports every package-to-package edge that lies on a cycle, one violation per edge.
 *
 * <p>ArchUnit's own {@code beFreeOfCycles()} lists elementary cycles, and with packages as tangled as
 * {@code service}/{@code domain}/{@code tg} there are too many of them to enumerate (it runs out of heap).
 * An edge is cyclic when both ends are in the same strongly connected component, which is linear to compute
 * and gives a stable, short list to freeze: a new cyclic edge fails, a new import along a frozen edge does not.
 */
class CyclicPackageDependencies extends ArchCondition<Slice> {

    private final String rootPackage;
    private Map<String, Set<String>> edges = Map.of();
    private Map<String, Integer> component = Map.of();

    CyclicPackageDependencies(String rootPackage) {
        super("not depend on a package that depends back on it");
        this.rootPackage = rootPackage + ".";
    }

    @Override
    public void init(Collection<Slice> slices) {
        Map<String, Set<String>> graph = new TreeMap<>();
        for (Slice slice : slices) {
            String from = slice.getDescription();
            Set<String> targets = graph.computeIfAbsent(from, k -> new TreeSet<>());
            for (Dependency dependency : slice.getDependenciesFromSelf()) {
                topLevelPackage(dependency.getTargetClass())
                        .filter(to -> !to.equals(from))
                        .ifPresent(targets::add);
            }
        }
        edges = graph;
        component = stronglyConnectedComponents(graph);
    }

    @Override
    public void check(Slice slice, ConditionEvents events) {
        String from = slice.getDescription();
        for (String to : edges.getOrDefault(from, Set.of())) {
            Integer fromComponent = component.get(from);
            if (fromComponent != null && fromComponent.equals(component.get(to))) {
                String message = "Package cycle: " + from + " -> " + to + " (and " + to + " reaches " + from + " back)";
                events.add(SimpleConditionEvent.violated(slice, message));
            }
        }
    }

    private Optional<String> topLevelPackage(JavaClass javaClass) {
        String name = javaClass.getPackageName() + ".";
        if (!name.startsWith(rootPackage) || name.length() == rootPackage.length()) {
            return Optional.empty();
        }
        String rest = name.substring(rootPackage.length());
        return Optional.of(rest.substring(0, rest.indexOf('.')));
    }

    /** Tarjan's algorithm, iterative so a deep graph cannot overflow the stack. Returns node → component id. */
    private static Map<String, Integer> stronglyConnectedComponents(Map<String, Set<String>> graph) {
        Map<String, Integer> index = new HashMap<>();
        Map<String, Integer> lowLink = new HashMap<>();
        Map<String, Integer> result = new HashMap<>();
        Deque<String> stack = new ArrayDeque<>();
        Set<String> onStack = new HashSet<>();
        int[] counter = {0};

        for (String start : graph.keySet()) {
            if (index.containsKey(start)) {
                continue;
            }
            Deque<Map.Entry<String, Iterator<String>>> work = new ArrayDeque<>();
            visit(start, graph, index, lowLink, stack, onStack, counter, work);
            while (!work.isEmpty()) {
                Map.Entry<String, Iterator<String>> frame = work.peek();
                String node = frame.getKey();
                if (frame.getValue().hasNext()) {
                    String next = frame.getValue().next();
                    if (!index.containsKey(next)) {
                        visit(next, graph, index, lowLink, stack, onStack, counter, work);
                    } else if (onStack.contains(next)) {
                        lowLink.put(node, Math.min(lowLink.get(node), index.get(next)));
                    }
                    continue;
                }
                work.pop();
                if (!work.isEmpty()) {
                    String parent = work.peek().getKey();
                    lowLink.put(parent, Math.min(lowLink.get(parent), lowLink.get(node)));
                }
                if (lowLink.get(node).equals(index.get(node))) {
                    String member;
                    do {
                        member = stack.pop();
                        onStack.remove(member);
                        result.put(member, index.get(node));
                    } while (!member.equals(node));
                }
            }
        }
        return result;
    }

    private static void visit(String node, Map<String, Set<String>> graph, Map<String, Integer> index,
                              Map<String, Integer> lowLink, Deque<String> stack, Set<String> onStack, int[] counter,
                              Deque<Map.Entry<String, Iterator<String>>> work) {
        index.put(node, counter[0]);
        lowLink.put(node, counter[0]);
        counter[0]++;
        stack.push(node);
        onStack.add(node);
        work.push(Map.entry(node, graph.getOrDefault(node, Set.of()).iterator()));
    }
}
