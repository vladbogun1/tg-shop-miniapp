package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.translation.app.TranslatableSource.Field;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportItem;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportResult;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.MachineTranslationException;
import com.maxsolch.shop.translation.domain.MachineTranslator;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.BiFunction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AutoTranslationTest {

    private static final Key TITLE = new Key(TranslationEntityType.PRODUCT, "00000000-0000-0000-0000-00000000000a", "title");
    private static final Key DESC = new Key(TranslationEntityType.PRODUCT, "00000000-0000-0000-0000-00000000000a", "description");

    private final FakeTranslator translator = new FakeTranslator();
    private final AutoTranslationReads reads = mock(AutoTranslationReads.class);
    private final TranslationImport importer = mock(TranslationImport.class);
    private final AutoTranslationProperties props = new AutoTranslationProperties();
    private final Map<String, String> settingsStore = new HashMap<>();
    private final SettingsService settings = mock(SettingsService.class);
    private final Map<Key, Field> sources = new LinkedHashMap<>();
    private AutoTranslation auto;

    @BeforeEach
    void setUp() {
        when(reads.sources()).thenReturn(sources);
        when(reads.rows(anyString())).thenReturn(new HashMap<>());
        when(importer.importBuiltinAi(anyString(), anyList(), anyLong())).thenAnswer(inv -> {
            List<?> items = inv.getArgument(1);
            return new ImportResult(items.size(), 0, 0, 0, 0, List.of());
        });
        when(settings.system(anyString())).thenAnswer(inv -> Optional.ofNullable(settingsStore.get(inv.<String>getArgument(0))));
        doAnswer(inv -> settingsStore.put(inv.getArgument(0), inv.getArgument(1)))
                .when(settings).putSystem(anyString(), anyString());
        auto = new AutoTranslation(translator, reads, importer, props, new AutoTranslationRejects(settings),
                Clock.fixed(Instant.parse("2026-11-10T10:00:00Z"), ZoneOffset.UTC));
    }

    @Test
    void withoutKeyNothingRuns() {
        translator.key = false;
        sources.put(TITLE, new Field("Мышь Lamzu", true));

        assertThat(auto.runOnce()).isNull();
        verify(importer, never()).importBuiltinAi(anyString(), anyList(), anyLong());
    }

    @Test
    void translatesBothLanguagesAndWritesAsBuiltinAi() {
        sources.put(TITLE, new Field("Мышь Lamzu", true));
        translator.answer = (t, l) -> "uk".equals(l) ? "Мишка Lamzu" : "Lamzu mouse";

        AutoTranslation.AutoTranslationLastRun run = auto.runOnce();

        assertThat(run.written()).isEqualTo(2);
        assertThat(run.error()).isNull();
        assertThat(translator.locales).containsExactly("uk", "en");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ImportItem>> items = ArgumentCaptor.forClass(List.class);
        verify(importer).importBuiltinAi(eq("uk"), items.capture(), eq(AutoTranslation.AUTO_ACTOR));
        assertThat(items.getValue()).singleElement().satisfies(i -> {
            assertThat(i.text()).isEqualTo("Мишка Lamzu");
            assertThat(i.field()).isEqualTo("title");
        });
    }

    @Test
    void unusableAnswerIsNotWrittenAndNotSentAgain() {
        sources.put(TITLE, new Field("Коврик 490 мм", true));
        translator.answer = (t, l) -> "uk".equals(l) ? "Килимок" : "Mouse pad";

        AutoTranslation.AutoTranslationLastRun first = auto.runOnce();
        AutoTranslation.AutoTranslationLastRun second = auto.runOnce();

        assertThat(first.rejected()).isEqualTo(2);
        assertThat(first.written()).isZero();
        assertThat(second.charsSent()).isZero();
        assertThat(translator.calls).isEqualTo(2);
        // kept in the database: a restarted or second backend does not resend it either
        assertThat(settingsStore.get(AutoTranslationRejects.KEY)).contains("uk:").contains("en:");
    }

    @Test
    void reserveAndRunLimitKeepLongTextsForLater() {
        sources.put(TITLE, new Field("Мышь", true));
        sources.put(DESC, new Field("Очень длинное описание товара", true));
        translator.usage = new MachineTranslator.Usage(0, 20_010);
        props.setReserveChars(20_000);

        AutoTranslation.AutoTranslationLastRun run = auto.runOnce();

        assertThat(run.charsSent()).isEqualTo(8);
        assertThat(run.charsWaiting()).isEqualTo(2L * "Очень длинное описание товара".length());
    }

    @Test
    void quotaErrorStopsTheRunAndIsShown() {
        sources.put(TITLE, new Field("Мышь", true));
        translator.failure = new MachineTranslationException(MachineTranslationException.Kind.QUOTA, "deepl 456");

        AutoTranslation.AutoTranslationLastRun run = auto.runOnce();

        assertThat(run.error()).startsWith("QUOTA");
        assertThat(auto.lastRun()).isEqualTo(run);
        verify(importer, never()).importBuiltinAi(anyString(), anyList(), anyLong());
    }

    /** Answers by a function of the source; counts calls and languages. */
    private static final class FakeTranslator implements MachineTranslator {
        boolean key = true;
        Usage usage = new Usage(0, 500_000);
        BiFunction<String, String, String> answer = (t, l) -> t;
        MachineTranslationException failure;
        int calls;
        final List<String> locales = new ArrayList<>();

        @Override
        public boolean configured() {
            return key;
        }

        @Override
        public Usage usage() {
            return usage;
        }

        @Override
        public List<String> translate(List<String> texts, String locale, String context)
                throws MachineTranslationException {
            if (failure != null) {
                throw failure;
            }
            calls++;
            locales.add(locale);
            return texts.stream().map(t -> answer.apply(t, locale)).toList();
        }

        @Override
        public int maxTextsPerCall() {
            return 50;
        }

        @Override
        public int maxCharsPerCall() {
            return 30_000;
        }
    }
}
