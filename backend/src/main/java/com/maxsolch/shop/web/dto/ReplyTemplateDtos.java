package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Chat reply templates (admin): the stored rows and the texts rendered for one order. */
public final class ReplyTemplateDtos {

    /** Longest template text, any language. */
    public static final int BODY_MAX_CHARS = 4000;

    private ReplyTemplateDtos() {
    }

    /**
     * A stored template: the Russian source and its uk/en translations (null when there is none).
     * {@code ukStale}/{@code enStale}: the translation was made for an older Russian text — it is
     * not used in the chat until it is updated (here or in «Переводы»).
     */
    public record TemplateDto(Long id, String title, String bodyRu, String bodyUk, String bodyEn, int sort,
                              boolean ukStale, boolean enStale) {
    }

    /**
     * Create / update payload. {@code bodyRu} is required; uk/en are optional hand-written
     * translations — blank removes one (the chat then falls back to Russian), an unchanged one is
     * left as it is (so editing only the Russian text marks it stale for «Переводы»).
     */
    public record TemplateUpsertRequest(
            @NotBlank @Size(max = 128) String title,
            @NotBlank @Size(max = BODY_MAX_CHARS) String bodyRu,
            @Size(max = BODY_MAX_CHARS) String bodyUk,
            @Size(max = BODY_MAX_CHARS) String bodyEn,
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
