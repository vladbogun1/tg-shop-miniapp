package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Chat reply templates (admin): the stored rows and the texts rendered for one order. */
public final class ReplyTemplateDtos {

    private ReplyTemplateDtos() {
    }

    /** A stored template, all three languages. */
    public record TemplateDto(Long id, String title, String bodyRu, String bodyUk, String bodyEn, int sort) {
    }

    /** Create / update payload. {@code bodyRu} is required; uk/en fall back to it when blank. */
    public record TemplateUpsertRequest(
            @NotBlank @Size(max = 128) String title,
            @NotBlank @Size(max = 4000) String bodyRu,
            @Size(max = 4000) String bodyUk,
            @Size(max = 4000) String bodyEn,
            Integer sort) {
    }

    /**
     * A template filled in for one order, in the customer's language.
     *
     * @param locale the language the text was taken in (uk / ru / en)
     */
    public record RenderedTemplateDto(Long id, String title, String text, String locale) {
    }
}
