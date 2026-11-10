package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.app.AutoTranslationPlan.Item;
import com.maxsolch.shop.translation.app.TranslatableSource.Field;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportItem;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.MachineTranslationException;
import com.maxsolch.shop.translation.domain.MachineTranslator;
import com.maxsolch.shop.translation.domain.TranslationAnswerCheck;
import com.maxsolch.shop.translation.domain.TranslationGlossary;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Background auto-translation: every Russian text of the shop that changed (or never had a translation) is sent to the
 * machine translator and written as a translation of the built-in AI — whatever the path of the change (product form,
 * cards, supply, SQL import), because the work is found by the source hash, not by hooks in each place.
 *
 * <p>A translation a person wrote (MANUAL) is never replaced. The answer passes the same checks as the AI answer of the
 * «Переводы» screen ({@link TranslationAnswerCheck}); an unusable one is not written and its text is not sent again
 * ({@link AutoTranslationRejects}, else it would be billed every run). The run never spends the last
 * {@code reserve-chars} of the monthly limit and at most {@code max-chars-per-run} characters.
 */
@Slf4j
@Service
public class AutoTranslation {

    /**
     * Stands for «no admin» in {@code updated_by}: the rows are marked as written by the built-in AI
     * ({@link ContentTranslation#markBuiltinAi}), so «Проверить ИИ» lists them.
     */
    static final long AUTO_ACTOR = Long.MAX_VALUE;

    /** What the last run did; {@code error} is null when it went through. */
    public record AutoTranslationLastRun(Instant at, int written, int rejected, long charsSent, long charsWaiting,
                                         @Nullable String error) {
    }

    private final MachineTranslator translator;
    private final AutoTranslationReads reads;
    private final TranslationImport importer;
    private final AutoTranslationProperties props;
    private final Clock clock;
    private final AutoTranslationRejects rejects;
    private final AtomicReference<AutoTranslationLastRun> last = new AtomicReference<>();

    AutoTranslation(MachineTranslator translator, AutoTranslationReads reads, TranslationImport importer,
                    AutoTranslationProperties props, AutoTranslationRejects rejects, Clock clock) {
        this.rejects = rejects;
        this.translator = translator;
        this.reads = reads;
        this.importer = importer;
        this.props = props;
        this.clock = clock;
    }

    public boolean active() {
        return props.isEnabled() && translator.configured();
    }

    public AutoTranslationLastRun lastRun() {
        return last.get();
    }

    /** One run; null when switched off or without a key. */
    public AutoTranslationLastRun runOnce() {
        if (!active()) {
            return null;
        }
        Run run = new Run(rejects.load());
        try {
            long left = translator.usage().remaining() - props.getReserveChars();
            run.budget = Math.min(props.getMaxCharsPerRun(), left);
            Map<Key, Field> sources = reads.sources();
            for (String locale : ContentLocale.TRANSLATED) {
                translateLocale(run, locale, sources);
            }
        } catch (MachineTranslationException e) {
            run.error = e.kind() + ": " + e.getMessage();
            log.warn("auto-translation stopped: {}", run.error);
        }
        AutoTranslationLastRun result = new AutoTranslationLastRun(clock.instant(), run.written, run.rejected, run.sent,
                Math.max(0, run.waiting - run.sent), run.error);
        last.set(result);
        if (run.written > 0 || run.rejected > 0) {
            log.info("auto-translation: written {}, rejected {}, sent {} chars, waiting {} chars",
                    result.written(), result.rejected(), result.charsSent(), result.charsWaiting());
        }
        return result;
    }

    /** Counters of one run. */
    private static final class Run {
        final Set<String> knownRejects;
        final List<String> newRejects = new ArrayList<>();
        long budget;
        long sent;
        long waiting;
        int written;
        int rejected;
        String error;

        Run(Set<String> knownRejects) {
            this.knownRejects = knownRejects;
        }
    }

    private void translateLocale(Run run, String locale, Map<Key, Field> sources) throws MachineTranslationException {
        List<Item> pending = AutoTranslationPlan.pending(sources, reads.rows(locale), props.getSkipTypes(),
                hash -> run.knownRejects.contains(AutoTranslationRejects.mark(locale, hash)));
        run.waiting += AutoTranslationPlan.chars(pending);
        for (List<Item> call : AutoTranslationPlan.calls(pending, run.budget - run.sent,
                translator.maxTextsPerCall(), translator.maxCharsPerCall())) {
            List<String> answers = translator.translate(call.stream().map(Item::source).toList(), locale,
                    TranslationGlossary.TEXT);
            run.sent += AutoTranslationPlan.chars(call);
            write(run, locale, call, answers);
            rejects.add(run.newRejects);
            run.newRejects.clear();
        }
    }

    private void write(Run run, String locale, List<Item> call, List<String> answers) {
        List<ImportItem> items = new ArrayList<>();
        for (int i = 0; i < call.size(); i++) {
            Item item = call.get(i);
            String clean = TranslationAnswerCheck.normalize(item.source(), answers.get(i));
            List<String> errors = TranslationAnswerCheck.errors(item.source(), locale, clean);
            if (!errors.isEmpty()) {
                run.rejected += item.keys().size();
                run.newRejects.add(AutoTranslationRejects.mark(locale, item.hash()));
                log.info("auto-translation {} of {} rejected: {}", locale, item.keys().get(0), errors);
                continue;
            }
            for (Key key : item.keys()) {
                items.add(new ImportItem(key.type().name(), key.entityId(), key.field(), item.hash(), clean));
            }
        }
        if (!items.isEmpty()) {
            run.written += importer.importBuiltinAi(locale, items, AUTO_ACTOR).applied();
        }
    }
}
