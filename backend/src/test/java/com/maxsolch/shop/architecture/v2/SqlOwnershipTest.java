package com.maxsolch.shop.architecture.v2;

import com.maxsolch.shop.architecture.v2.V2Rules.Violation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Rule M3 (SQL to a table of another module) and the owner of every table, on sources written into a temp folder. */
class SqlOwnershipTest {

    @TempDir
    Path dir;

    private void source(String relative, String body) throws IOException {
        Path file = dir.resolve(relative);
        Files.createDirectories(file.getParent());
        Files.writeString(file, body);
    }

    @Test
    void sqlToAnotherModulesTableIsFoundAndOwnTablesAreNot() throws IOException {
        source("gift/infra/Own.java", "class Own { String s = \"SELECT * FROM order_gift_cases WHERE id = ?\"; }");
        source("gift/infra/Foreign.java", "class Foreign { String s = \"SELECT o.id FROM \" + \"orders o JOIN users u ON 1=1\"; }");
        source("gift/app/Update.java", "class Update { String s = \"UPDATE promo_codes SET used = 1\"; }");

        List<Violation> found = SqlOwnership.scan(dir, "com.maxsolch.shopfixture");

        assertThat(found).extracting(Violation::key).anyMatch(k -> k.contains("gift.infra.Foreign -> table orders of order"))
                .anyMatch(k -> k.contains("gift.infra.Foreign -> table users of customer"))
                .anyMatch(k -> k.contains("gift.app.Update -> table promo_codes of promo"))
                .noneMatch(k -> k.contains("gift.infra.Own "));
        assertThat(found).allMatch(v -> v.rule().equals("M3") && v.module().equals("gift"));
    }

    @Test
    void readModelsMayReadAnyTable() throws IOException {
        source("analytics/infra/Report.java", "class Report { String s = \"SELECT COUNT(*) FROM orders JOIN users ON 1=1\"; }");
        source("finance/app/Money.java", "class Money { String s = \"SELECT SUM(x) FROM payment_invoices\"; }");

        assertThat(SqlOwnership.scan(dir, "com.maxsolch.shopfixture")).isEmpty();
    }

    @Test
    void aTableWithoutAnOwnerIsReported() throws IOException {
        source("db/V1__a.sql", "CREATE TABLE orders (id INT);\nCREATE TABLE IF NOT EXISTS `brand_new_table` (id INT);");

        assertThat(SqlOwnership.unownedTables(dir.resolve("db"))).containsExactly("brand_new_table");
    }
}
