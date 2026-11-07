package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.ai.app.AiJobDto;
import com.maxsolch.shop.ai.app.AiJobs;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * "Fill in the card with AI" for ONE product: the card screens send only the product, the version of the card the
 * prompt was built from and the prompt itself (built in the admin, the same text that is copied for ChatGPT); the
 * rules of a card job are fixed here, so no screen can start a dearer one: medium effort, a research budget of one
 * product (3 searches and 4 pages, see ResearchTools in the ai module), the feature from the screen (a card just created, or
 * filling in an existing one). The product must exist; everything else is {@link AiJobs#create}.
 */
@Service
public class CardAiJobs {

    static final String SUBJECT = "PRODUCT";
    static final String EFFORT = "medium";
    static final int MAX_VERSION = 64;
    static final int MAX_PROMPT_VERSION = 32;

    /**
     * @param created true for a card just created (feature CARD), false for filling in an existing one (COMPLETION)
     * @param subjectVersion fingerprint of the card the prompt was built from; the review compares it with the card
     */
    public record Start(String productId, boolean created, String subjectVersion, String prompt,
                        String promptVersion) {
    }

    private final AiJobs jobs;
    private final ProductBriefs products;

    public CardAiJobs(AiJobs jobs, ProductBriefs products) {
        this.jobs = jobs;
        this.products = products;
    }

    public AiJobDto start(Start req, String idemKey) {
        validate(req);
        byte[] id = UuidUtil.toBytes(req.productId());
        if (products.briefs(List.of(id)).isEmpty()) {
            throw new DomainException.NotFound(AiError.SUBJECT_NOT_FOUND);
        }
        AiFeature feature = req.created() ? AiFeature.CARD : AiFeature.COMPLETION;
        return jobs.create(new AiJobs.CreateJob(feature, SUBJECT, UuidUtil.toString(id), req.subjectVersion(),
                JobMode.NORMAL, EFFORT, 1, req.prompt(), req.promptVersion()), idemKey);
    }

    static void validate(Start req) {
        if (req == null || req.productId() == null || !isUuid(req.productId())) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "productId");
        }
        if (req.subjectVersion() == null || req.subjectVersion().isBlank() || req.subjectVersion().length() > MAX_VERSION) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "subjectVersion");
        }
        if (req.promptVersion() != null && req.promptVersion().length() > MAX_PROMPT_VERSION) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "promptVersion");
        }
    }

    private static boolean isUuid(String s) {
        try {
            UuidUtil.toBytes(s);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
