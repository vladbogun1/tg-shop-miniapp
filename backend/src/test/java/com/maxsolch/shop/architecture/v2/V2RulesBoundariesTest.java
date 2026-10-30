package com.maxsolch.shop.architecture.v2;

import com.maxsolch.shop.architecture.v2.V2Rules.Violation;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The boundary rules of step 9e, on the fixtures of the modules review, customer and staff. */
class V2RulesBoundariesTest {

    private static final List<Violation> VIOLATIONS = new V2Rules("com.maxsolch.shopfixture")
            .evaluate(new ClassFileImporter().importPackages("com.maxsolch.shopfixture"));

    private static long count(String rule, String module) {
        return VIOLATIONS.stream().filter(v -> v.rule().equals(rule) && v.module().equals(module)).count();
    }

    @Test
    void cycleBetweenModulesOfOneRowIsFound() {
        assertThat(count("M2", "customer")).isEqualTo(1);
        assertThat(count("M2", "staff")).isEqualTo(1);
    }

    @Test
    void appWithWebTypesIsFound() {
        assertThat(count("L5", "review")).isEqualTo(1);
    }

    @Test
    void jdbcAndNativeQueriesOutsideInfraAreFound() {
        assertThat(count("S1", "review")).isEqualTo(2);
    }

    @Test
    void controllerWritingTheJournalIsFound() {
        assertThat(count("A2", "review")).isEqualTo(1);
    }

    @Test
    void handCheckedRightsInApiAndAppAreFound() {
        assertThat(count("A3", "review")).isEqualTo(2);
    }
}
