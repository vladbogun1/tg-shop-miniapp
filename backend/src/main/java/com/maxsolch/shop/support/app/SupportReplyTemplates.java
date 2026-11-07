package com.maxsolch.shop.support.app;

import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.support.app.ReplyTemplateDtos.RenderedTemplateDto;
import com.maxsolch.shop.support.domain.SupportThread;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Canned replies for a support thread. They are the same templates as in the order chat (one list,
 * managed in one place); here only the placeholders differ: {@code {name}} is the customer from the
 * thread and {@code {product}} the product the question is about. Order placeholders ({@code {ttn}},
 * {@code {total}}…) have no value in a thread and stay as typed, so the admin sees and removes them.
 */
@Service
public class SupportReplyTemplates {

    private final SupportThreadLookup lookup;
    private final ReplyTemplateService templates;
    private final Messages messages;

    SupportReplyTemplates(SupportThreadLookup lookup, ReplyTemplateService templates, Messages messages) {
        this.lookup = lookup;
        this.templates = templates;
        this.messages = messages;
    }

    /** Templates filled in for this thread, in the customer's language (uk fallback, then ru). */
    @Transactional(readOnly = true)
    public List<RenderedTemplateDto> forThread(String threadId) {
        SupportThread thread = lookup.load(threadId);
        Locale locale = messages.localeOf(thread.getTgUserId());
        return templates.renderAll(variables(thread), locale);
    }

    static Map<String, String> variables(SupportThread thread) {
        Map<String, String> v = new LinkedHashMap<>();
        v.put("name", thread.getCustomerName() == null ? "" : thread.getCustomerName().trim());
        if (thread.getProductTitle() != null && !thread.getProductTitle().isBlank()) {
            v.put("product", thread.getProductTitle().trim());
        }
        return v;
    }
}
