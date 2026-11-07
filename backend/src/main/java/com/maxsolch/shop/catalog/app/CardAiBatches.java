package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.ai.app.AiBatchDto;
import com.maxsolch.shop.ai.app.AiBatches;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * «Заполнить с ИИ (N)» for the products picked in the catalog: one batch, one task per product. As for one product
 * ({@link CardAiJobs}) the screen sends the product, the version of the card the prompt was built from and the prompt;
 * the rules are fixed here: medium effort, the research budget of one product, filling in existing cards
 * (COMPLETION). Every product must exist; the rest is {@link AiBatches#create}.
 */
@Service
public class CardAiBatches {

    /** One product of the batch. */
    public record Product(String productId, String subjectVersion, String prompt) {
    }

    public record Start(List<Product> items, String promptVersion) {
    }

    private final AiBatches batches;
    private final ProductBriefs products;

    public CardAiBatches(AiBatches batches, ProductBriefs products) {
        this.batches = batches;
        this.products = products;
    }

    public AiBatchDto start(Start req, String idemKey) {
        if (req == null || req.items() == null || req.items().isEmpty()) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "items");
        }
        if (req.promptVersion() != null && req.promptVersion().length() > CardAiJobs.MAX_PROMPT_VERSION) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "promptVersion");
        }
        List<AiBatches.Item> items = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (Product p : req.items()) {
            if (p == null || p.productId() == null || p.subjectVersion() == null || p.subjectVersion().isBlank()
                    || p.subjectVersion().length() > CardAiJobs.MAX_VERSION) {
                throw new DomainException.BadRequest(AiError.BAD_REQUEST, "items");
            }
            String id = uuid(p.productId());
            if (!ids.add(id)) {
                throw new DomainException.BadRequest(AiError.BAD_REQUEST, "items");
            }
            items.add(new AiBatches.Item(CardAiJobs.SUBJECT, id, p.subjectVersion(), p.prompt()));
        }
        long found = products.briefs(ids.stream().map(UuidUtil::toBytes).toList()).size();
        if (found != ids.size()) {
            throw new DomainException.NotFound(AiError.SUBJECT_NOT_FOUND);
        }
        return batches.create(new AiBatches.Create(AiFeature.COMPLETION, JobMode.NORMAL, CardAiJobs.EFFORT, 1,
                req.promptVersion(), items), idemKey);
    }

    private static String uuid(String s) {
        try {
            return UuidUtil.toString(UuidUtil.toBytes(s));
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "productId");
        }
    }
}
