package com.maxsolch.shop.architecture.v2;

import com.maxsolch.shop.architecture.v2.V2Rules.Violation;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The rules themselves, checked on small fixture classes in com.maxsolch.shopfixture (a target layout in miniature). */
class V2RulesTest {

    private static final List<Violation> VIOLATIONS = new V2Rules("com.maxsolch.shopfixture")
            .evaluate(new ClassFileImporter().importPackages("com.maxsolch.shopfixture"));

    private static long count(String rule, String module) {
        return VIOLATIONS.stream().filter(v -> v.rule().equals(rule) && v.module().equals(module)).count();
    }

    @Test
    void apiMayNotUseInfra() {
        assertThat(count("L1", "order")).isEqualTo(1);
    }

    @Test
    void appMayNotUseApi() {
        assertThat(count("L2", "order")).isEqualTo(1);
    }

    @Test
    void domainStaysFreeOfWebClients() {
        assertThat(count("L3", "order")).isEqualTo(1);
    }

    @Test
    void anotherModuleIsReachedThroughAppOnly() {
        assertThat(count("M1", "cart")).isEqualTo(1);
        assertThat(count("M1", "catalog")).isZero();
    }

    @Test
    void dependencyAgainstModuleDirectionIsFound() {
        assertThat(count("M2", "catalog")).isEqualTo(1);
        assertThat(count("M2", "cart")).isEqualTo(1);
        assertThat(count("M2", "order")).isZero();
    }

    @Test
    void legacyClassesAreCountedUnderLegacy() {
        assertThat(count("V1", "legacy")).isEqualTo(1);
        assertThat(count("K1", "legacy")).isEqualTo(1);
        assertThat(count("C1", "legacy")).isEqualTo(2);
    }

    @Test
    void cleanUseCaseHasNoViolations() {
        assertThat(VIOLATIONS).noneMatch(v -> v.key().contains("GoodUseCase"));
    }
}
