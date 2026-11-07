package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.ChatModel.ImagePart;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * The pictures a running task shows to the model: none for the features that work on text, the attached (or, for a
 * retry, the repeated task's) files for reading an invoice. An invoice task with no picture left (deleted after the
 * 7 days) is not asked blind: the model would invent lines, so it ends as «files gone» before any money is reserved.
 */
@Service
public class AiJobImages {

    private final AiFiles files;
    private final AiJobReads reads;

    public AiJobImages(AiFiles files, AiJobReads reads) {
        this.files = files;
        this.reads = reads;
    }

    public List<ImagePart> of(AiJob job) {
        if (job.getFeature() != AiFeature.SUPPLY_EXTRACT) {
            return List.of();
        }
        List<ImagePart> images = files.imagesOf(job, id -> reads.source(id).map(AiJobReads.Source::job).orElse(null));
        if (images.isEmpty()) {
            throw new DomainException.Conflict(AiError.FILES_GONE);
        }
        return images;
    }
}
