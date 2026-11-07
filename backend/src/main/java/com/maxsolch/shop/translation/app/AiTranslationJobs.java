package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.ai.app.AiBatchDto;
import com.maxsolch.shop.ai.app.AiBatches;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.translation.domain.SourceHash;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * «Перевести с ИИ (N)» for the rows of the translations screen: one batch, one task per part of at most
 * {@link #MAX_STRINGS} strings. The screen cuts the rows into parts and builds the prompt of each exactly as for the
 * manual path (so one prompt works for both); the rules are fixed here: medium effort, no research, at most
 * {@code ai.batchSize} parts, every part once. The answer is written by {@link AiTranslationApply} as drafts of the
 * built-in AI, a translation a person wrote is never replaced. Everything else is {@link AiBatches#create}.
 */
@Service
public class AiTranslationJobs {

    public static final String SUBJECT = "TRANSLATION_PART";
    public static final int MAX_STRINGS = 60;
    static final String EFFORT = "medium";
    static final int MAX_PROMPT_VERSION = 32;

    /** One part: its number on the screen and the prompt (a json object of ids to the Russian text and the placeholders). */
    public record Part(int part, String prompt) {
    }

    public record Start(List<Part> items, String promptVersion) {
    }

    private final AiBatches batches;

    public AiTranslationJobs(AiBatches batches) {
        this.batches = batches;
    }

    public AiBatchDto start(Start req, String idemKey) {
        if (req == null || req.items() == null || req.items().isEmpty()) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "items");
        }
        if (req.promptVersion() != null && req.promptVersion().length() > MAX_PROMPT_VERSION) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "promptVersion");
        }
        List<AiBatches.Item> items = new ArrayList<>();
        for (Part p : req.items()) {
            items.add(item(p));
        }
        return batches.create(new AiBatches.Create(AiFeature.TRANSLATION, JobMode.NORMAL, EFFORT, 0,
                req.promptVersion(), items), idemKey);
    }

    private static AiBatches.Item item(Part p) {
        if (p == null || p.part() < 1 || p.part() > 999 || p.prompt() == null || p.prompt().isBlank()) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "items");
        }
        Set<String> ids = TranslationAnswerJson.asked(p.prompt());
        if (ids == null || ids.isEmpty() || ids.size() > MAX_STRINGS) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "items");
        }
        String hash = SourceHash.sha256Hex(p.prompt()).substring(0, 12);
        return new AiBatches.Item(SUBJECT, p.part() + "-" + hash, hash, p.prompt());
    }
}
