package com.maxsolch.shop.procurement.domain.supplyai;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The prompts live in two places - TS (manual path in the admin UI) and Java (server pipeline) - and must not drift.
 * Step 1 is compared with the TS source itself; step 2 with a golden file taken from the TS build (tsx, same fixture).
 */
class SupplyPromptsInSyncTest {

    private static final Path TS = Path.of("../frontend-admin/features/supply/model/ai/extract-prompt.ts");

    /** The TS file as LF text (a Windows checkout may have CRLF). */
    private static String ts() throws IOException {
        return Files.readString(TS, StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    void extractPromptEqualsTheTsText() throws IOException {
        Assumptions.assumeTrue(Files.exists(TS), "frontend-admin is not next to backend");
        Matcher m = Pattern.compile("EXTRACT_PROMPT = `([\\s\\S]*?)`;").matcher(ts());
        assertThat(m.find()).isTrue();
        assertThat(SupplyExtract.PROMPT).isEqualTo(m.group(1).replace("\\`", "`"));
        Matcher v = Pattern.compile("EXTRACT_PROMPT_VERSION = \"([^\"]+)\"").matcher(ts());
        assertThat(v.find()).isTrue();
        assertThat(SupplyExtract.PROMPT_VERSION).isEqualTo(v.group(1));
    }

    @Test
    void matchPromptAndSubjectEqualTheTsGolden() throws IOException {
        CatalogItem zp1 = new CatalogItem("11111111-aaaa-4000-8000-000000000001", "Коврик Zpmax ZP1 Advanced 490×420 чёрный",
                "Zpmax", "c-mats", List.of(), null);
        CatalogItem sleeve = new CatalogItem("22222222-bbbb-4000-8000-000000000001", "Рукав Zpmax 4.0 Ice (правая рука)",
                "Zpmax", "c-acc", List.of(new CatalogItem.Variant("v-m", "M"), new CatalogItem.Variant("v-xl", "XL")), null);
        CatalogItem nobrand = new CatalogItem("33333333-cccc-4000-8000-000000000001", "Глайды без бренда", null, null, List.of(), null);
        List<ReviewRow> rows = List.of(
                new ReviewRow(line("L1", "Zpmax准枪ZP1控制鼠标垫FPS", "ZP1 黑色", "ZP1 mouse pad"), LineDecision.open(),
                        List.of(new Candidate(zp1.id(), null, 5), new Candidate(sleeve.id(), "v-xl", 3), new Candidate("missing", null, 1))),
                new ReviewRow(line("L2", "西城WESTLAB小圆点脚贴", null, null), LineDecision.open(),
                        List.of(new Candidate(nobrand.id(), null, 1))),
                new ReviewRow(line("L3", "Unknown", null, null), LineDecision.open(), List.of()));
        List<LeafCategory> cats = List.of(new LeafCategory("c-mats", "kovriki", "Коврики"), new LeafCategory("c-g", "glajdy", "Глайды"));

        assertThat(MatchPrompt.build(rows, List.of(zp1, sleeve, nobrand), cats)).isEqualTo(golden("match-prompt.golden.txt"));
        assertThat(MatchPrompt.subject(rows)).isEqualTo(golden("match-subject.golden.txt"));
    }

    private static SourceLine line(String id, String text, String variant, String en) {
        return new SourceLine(id, text, variant, en, null, null, null, 1, 1.0, null, null);
    }

    private static String golden(String name) throws IOException {
        try (InputStream in = SupplyPromptsInSyncTest.class.getResourceAsStream("/supplyai/" + name)) {
            assertThat(in).as(name).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
