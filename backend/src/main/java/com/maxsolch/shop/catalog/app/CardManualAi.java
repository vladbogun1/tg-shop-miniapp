package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.ai.app.AiJobDto;
import com.maxsolch.shop.ai.app.AiManualBatches;
import com.maxsolch.shop.ai.app.AiPastedJobs;
import com.maxsolch.shop.ai.app.ManualBatchDto;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * «Через ChatGPT вручную» for cards: the answer the admin pasted becomes a task of the AI tasks (no model, no money,
 * works with the AI off), for one product or for a manual batch of the picked products, part by part. The products
 * must exist; the subject and the feature are fixed here, as for {@link CardAiJobs}: a batch fills in existing cards
 * (COMPLETION), one product is CARD when it was just created. Everything else is {@link AiManualBatches} and
 * {@link AiPastedJobs}.
 */
@Service
public class CardManualAi {

    static final String PROMPT_VERSION = "card-v1";

    /** One product of a manual batch and the version of its card the prompts are built from. */
    public record ManualCardItem(String productId, String subjectVersion) {
    }

    /** @param partSize products per prompt (4 or 8 on the screen); @param draft the screen's draft, JSON */
    public record ManualCardBatchStart(List<ManualCardItem> items, int partSize, String draft) {
    }

    /** The screen's draft: JSON of its own (the current part, the pasted texts). */
    public record ManualDraft(String draft) {
    }

    /** The answers of one part: {@code part} — every product of the part, the ones without an answer included. */
    public record ManualCardPart(String prompt, String promptVersion, List<String> part,
                                 List<ManualCardAnswer> answers) {
    }

    public record ManualCardAnswer(String productId, String subjectVersion, String answer) {
    }

    /** One product outside a batch; {@code created}: a card just created (CARD), else filling in (COMPLETION). */
    public record ManualCardPaste(String productId, boolean created, String subjectVersion, String prompt,
                                  String promptVersion, String answer) {
    }

    private final AiManualBatches batches;
    private final AiPastedJobs pasted;
    private final ProductBriefs products;

    public CardManualAi(AiManualBatches batches, AiPastedJobs pasted, ProductBriefs products) {
        this.batches = batches;
        this.pasted = pasted;
        this.products = products;
    }

    public ManualBatchDto start(ManualCardBatchStart req) {
        if (req == null || req.items() == null || req.items().isEmpty()) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "items");
        }
        List<ManualBatchDto.Item> items = req.items().stream()
                .map(p -> new ManualBatchDto.Item(uuid(p == null ? null : p.productId()), p == null ? null : p.subjectVersion()))
                .toList();
        exist(items.stream().map(ManualBatchDto.Item::subjectId).toList());
        return batches.create(new AiManualBatches.Start(AiFeature.COMPLETION, CardAiJobs.SUBJECT, items,
                req.partSize(), req.draft()));
    }

    public Optional<ManualBatchDto> current() {
        return batches.current();
    }

    public ManualBatchDto get(long id) {
        return batches.get(id);
    }

    public ManualBatchDto saveDraft(long id, String draft) {
        return batches.saveDraft(id, draft);
    }

    public ManualBatchDto answers(long id, ManualCardPart req) {
        if (req == null || req.part() == null || req.answers() == null) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "part");
        }
        List<AiManualBatches.Answer> answers = req.answers().stream()
                .map(a -> a == null ? null : new AiManualBatches.Answer(uuid(a.productId()), a.subjectVersion(), a.answer()))
                .toList();
        return batches.answers(id, new AiManualBatches.Answers(req.prompt(), version(req.promptVersion()),
                req.part().stream().map(CardManualAi::uuid).toList(), answers));
    }

    public ManualBatchDto finish(long id) {
        return batches.finish(id);
    }

    public ManualBatchDto discard(long id) {
        return batches.discard(id);
    }

    public AiJobDto single(ManualCardPaste req) {
        if (req == null) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "productId");
        }
        String id = uuid(req.productId());
        exist(List.of(id));
        AiFeature feature = req.created() ? AiFeature.CARD : AiFeature.COMPLETION;
        return pasted.single(new AiPastedJobs.Paste(feature, CardAiJobs.SUBJECT, id, req.subjectVersion(),
                version(req.promptVersion()), req.prompt(), req.answer()));
    }

    private void exist(List<String> ids) {
        Set<String> unique = new LinkedHashSet<>(ids);
        if (products.briefs(unique.stream().map(UuidUtil::toBytes).toList()).size() != unique.size()) {
            throw new DomainException.NotFound(AiError.SUBJECT_NOT_FOUND);
        }
    }

    private static String version(String v) {
        return v == null || v.isBlank() ? PROMPT_VERSION : v;
    }

    private static String uuid(String s) {
        try {
            return UuidUtil.toString(UuidUtil.toBytes(s));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "productId");
        }
    }
}
