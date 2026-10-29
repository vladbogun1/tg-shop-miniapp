package com.maxsolch.shop.architecture;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.freeze.FreezingArchRule;
import org.springframework.data.repository.Repository;

import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.belongToAnyOf;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

/**
 * Architecture rules in "old debt frozen, new debt forbidden" mode: violations that existed when a rule was
 * introduced live in {@code src/test/resources/archunit_store/}, anything new fails the build. Matching is by
 * {@link SignatureInsensitiveMatcher}. Pure bytecode analysis, no Spring context. See docs/ARCHITECTURE-CHECKS.md.
 */
@AnalyzeClasses(packages = "com.maxsolch.shop", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule controllers_do_not_use_repositories = freeze(
            noClasses().that().resideInAPackage("..web.controller..")
                    .or().haveSimpleNameEndingWith("Controller")
                    .should().dependOnClassesThat(resideInAPackage("..repository..")
                            .or(assignableTo(Repository.class)))
                    .because("controllers parse the request and call a service; data access belongs to services"));

    @ArchTest
    static final ArchRule no_cycles_between_top_level_packages = freeze(
            slices().matching("com.maxsolch.shop.(*)..").namingSlices("$1")
                    .should(new CyclicPackageDependencies("com.maxsolch.shop"))
                    .because("a cycle between top-level packages means neither can change or be extracted alone"));

    @ArchTest
    static final ArchRule order_status_is_not_assigned_directly = freeze(
            noClasses().that(not(belongToAnyOf(Order.class)))
                    .should().callMethod(Order.class, "setStatus", OrderStatus.class)
                    .because("an order status transition must go through one method that checks it; "
                            + "every direct setStatus is a place that can skip those checks"));

    private static ArchRule freeze(ArchRule rule) {
        return FreezingArchRule.freeze(rule).associateViolationLinesVia(new SignatureInsensitiveMatcher());
    }
}
