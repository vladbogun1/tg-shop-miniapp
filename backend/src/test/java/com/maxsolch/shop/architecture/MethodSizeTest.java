package com.maxsolch.shop.architecture;

import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.LineMap;
import com.sun.source.tree.MethodTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.SourcePositions;
import com.sun.source.util.TreeScanner;
import com.sun.source.util.Trees;
import org.junit.jupiter.api.Test;

import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * No method or constructor in src/main/java may be longer than {@value #MAX_LINES} lines (from the first annotation or
 * modifier to the closing brace, comments and blank lines inside included) - no exceptions, no list of grandfathered
 * methods. A long method is several steps with names that nobody gave: cut it into private methods or a collaborator.
 * The source is parsed with the JDK's own compiler front end, so strings, text blocks and lambdas cannot confuse the count.
 * See docs/ARCHITECTURE-CHECKS.md.
 */
class MethodSizeTest {

    static final int MAX_LINES = 80;
    private static final Path SOURCES = Path.of("src/main/java");

    @Test
    void methodsStayWithinSizeLimit() throws IOException {
        assertThat(oversized(SOURCES)).as("methods over the size limit").isEmpty();
    }

    /** Methods longer than the limit under {@code root}, one line each: {@code file:line Class.method: N lines}. */
    static List<String> oversized(Path root) throws IOException {
        List<Path> files;
        try (Stream<Path> walk = Files.walk(root)) {
            files = walk.filter(p -> p.toString().endsWith(".java")).sorted().toList();
        }
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        List<String> problems = new ArrayList<>();
        try (StandardJavaFileManager fm = compiler.getStandardFileManager(null, null, StandardCharsets.UTF_8)) {
            Iterable<? extends JavaFileObject> units = fm.getJavaFileObjectsFromPaths(files);
            JavacTask task = (JavacTask) compiler.getTask(null, fm, d -> { }, List.of("-proc:none"), null, units);
            SourcePositions positions = Trees.instance(task).getSourcePositions();
            for (CompilationUnitTree unit : task.parse()) {
                LineMap lines = unit.getLineMap();
                String file = root.toAbsolutePath().relativize(Path.of(unit.getSourceFile().toUri())).toString().replace(java.io.File.separatorChar, '/');
                new TreeScanner<Void, String>() {
                    @Override
                    public Void visitClass(ClassTree tree, String outer) {
                        String name = tree.getSimpleName().toString();
                        return super.visitClass(tree, name.isEmpty() ? outer : name);
                    }

                    @Override
                    public Void visitLambdaExpression(LambdaExpressionTree tree, String owner) {
                        return super.visitLambdaExpression(tree, owner);
                    }

                    @Override
                    public Void visitMethod(MethodTree tree, String owner) {
                        long start = positions.getStartPosition(unit, tree);
                        long end = positions.getEndPosition(unit, tree);
                        long from = lines.getLineNumber(start);
                        long count = lines.getLineNumber(end) - from + 1;
                        if (count > MAX_LINES) {
                            problems.add(file + ":" + from + " " + owner + "." + tree.getName() + ": " + count
                                    + " lines, limit is " + MAX_LINES + " - cut it into named steps");
                        }
                        return super.visitMethod(tree, owner);
                    }
                }.scan(unit, "");
            }
        }
        return problems;
    }
}
