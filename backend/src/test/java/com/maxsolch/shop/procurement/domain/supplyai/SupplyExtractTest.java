package com.maxsolch.shop.procurement.domain.supplyai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Step 1: parsing the answer, numbers, currency, arithmetic. Ported from ai.test.ts and ai-fixes.test.ts. */
class SupplyExtractTest {

    @Test
    void readsLinesCurrencyAndPricesAsStringsAndReportsABadLine() {
        SupplyExtract.Parsed p = SupplyExtract.parse(Fx.TAOBAO);
        assertThat(p.doc().currency()).isEqualTo("CNY");
        assertThat(p.doc().lines()).hasSize(4);
        assertThat(p.doc().lines().get(0).unitPrice()).isEqualTo(134.67);
        assertThat(p.doc().lines().get(3).id()).isEqualTo("L4");
        assertThat(p.errors()).hasSize(1);
    }

    @Test
    void catchesScreenshotOverlapAndTotalMismatch() {
        ExtractedDoc doc = SupplyExtract.parse(Fx.TAOBAO).doc();
        assertThat(SupplyChecks.likelyRepeats(doc.lines())).isEqualTo(Set.of("L3"));
        assertThat(SupplyChecks.lineProblem(doc.lines().get(3))).isNull();
        SourceLine l = doc.lines().get(3);
        SourceLine wrong = new SourceLine(l.id(), l.text(), l.variant(), l.en(), l.brand(), l.model(), l.color(),
                l.qty(), l.unitPrice(), 500.0, l.notes());
        assertThat(SupplyChecks.lineProblem(wrong)).contains("538.68");
        assertThat(SupplyChecks.totalProblem(doc)).contains("разница");
        assertThat(SupplyChecks.totalProblem(doc, doc.lines().stream().filter(x -> !x.id().equals("L3")).toList())).isNotNull();
    }

    @Test
    void answerWithoutJsonIsAClearError() {
        assertThat(SupplyExtract.parse("не могу прочитать").errors().get(0)).contains("нет JSON");
    }

    @Test
    void repairsTrailingCommasAndSmartQuotes() {
        SupplyExtract.Parsed p = SupplyExtract.parse("{\"lines\": [{\"text\": \"a\", \"qty\": 1,},]}");
        assertThat(p.doc().lines()).hasSize(1);
        assertThat(p.notes()).containsExactly("убраны висячие запятые");
        SupplyExtract.Parsed q = SupplyExtract.parse("{“lines”: [{“text”: “a”, “qty”: 2}]}");
        assertThat(q.doc().lines().get(0).qty()).isEqualTo(2);
        assertThat(q.notes()).containsExactly("«умные» кавычки заменены на обычные");
    }

    @Test
    void brokenJsonAndMissingLines() {
        assertThat(SupplyExtract.parse("{\"lines\": [}").errors().get(0)).startsWith("JSON не читается: ");
        assertThat(SupplyExtract.parse("{\"a\": 1}").errors()).containsExactly("Нет списка строк \"lines\"");
        assertThat(SupplyExtract.parse("{\"lines\": [5, {\"text\": \"x\", \"qty\": 0}]}").errors()).containsExactly(
                "Строка 1: не объект", "Строка 2 («x»): количество должно быть целым от 1", "Ни одной строки товара");
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {"¥1 234,50|1234.5", "$42.50|42.5", "1,234.50|1234.5", "1.234,50|1234.5",
            "1,234|1234", "0,125|0.125", "12,5 грн|12.5", "10 zł|10", "1 000 000|1000000"})
    void parsesMoneyStrings(String raw, double want) {
        assertThat(SupplyNumbers.num(raw)).isEqualTo(want);
    }

    @ParameterizedTest
    @ValueSource(strings = {"12 pcs x2", "abc", "", "1.2.3,4,5", "--5"})
    void notANumber(String raw) {
        assertThat(SupplyNumbers.num(raw)).isNull();
    }

    @Test
    void currencies() {
        assertThat(currency("PLN")).isEqualTo("PLN");
        assertThat(currency("zł")).isEqualTo("PLN");
        assertThat(currency("грн")).isEqualTo("UAH");
        assertThat(currency("¤")).isNull();
    }

    private static String currency(String c) {
        return SupplyExtract.parse("{\"currency\":\"" + c + "\",\"lines\":[{\"text\":\"a\",\"qty\":1}]}").doc().currency();
    }

    @Test
    void textAndKeys() {
        assertThat(SupplyText.sourceKey("  Zpmax  ZP3 ", "Teal 490")).isEqualTo("zpmax zp3 | teal 490");
        assertThat(SupplyText.words("ZP1 Advanced 490*420 Чёрный")).containsExactly("zp1", "advanced", "490", "420", "черный");
        assertThat(SupplyText.words(null)).isEmpty();
        assertThat(SupplyChecks.round2(2.675)).isEqualTo(2.68);
        assertThat(SupplyChecks.linesSum(List.of(Fx.line("a", 3, 0.1), Fx.line("b", 1, null)))).isEqualTo(0.3);
    }

    @Test
    void supplierByName() {
        List<SupplierMatch.Named> list = List.of(new SupplierMatch.Named("1", "Taobao Zpmax准枪电竞外设企业店"),
                new SupplierMatch.Named("2", "A"), new SupplierMatch.Named("3", "Lamzu"));
        assertThat(SupplierMatch.byName("lamzu ", list)).isEqualTo("3");
        assertThat(SupplierMatch.byName("Zpmax准枪电竞外设企业店", list)).isEqualTo("1");
        assertThat(SupplierMatch.byName("Aliexpress Store", list)).isNull();
        assertThat(SupplierMatch.byName("", list)).isNull();
        assertThat(SupplierMatch.byName(null, list)).isNull();
    }
}
