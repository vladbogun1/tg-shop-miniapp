package com.maxsolch.shop.support.app;

import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.support.app.ReplyTemplateDtos.RenderedTemplateDto;
import com.maxsolch.shop.support.domain.SupportThread;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SupportReplyTemplatesTest {

    @Mock
    SupportThreadLookup lookup;
    @Mock
    ReplyTemplateService templates;
    @Mock
    Messages messages;

    private static SupportThread thread(String name, String product) {
        SupportThread t = new SupportThread();
        t.setTgUserId(77L);
        t.setCustomerName(name);
        t.setProductTitle(product);
        return t;
    }

    @Test
    void variables_haveTheCustomerAndTheProduct() {
        assertThat(SupportReplyTemplates.variables(thread(" Олексій ", "Wooting 60HE")))
                .containsEntry("name", "Олексій").containsEntry("product", "Wooting 60HE");
    }

    @Test
    void variables_withoutProductLeaveItOut_soThePlaceholderStaysVisible() {
        Map<String, String> v = SupportReplyTemplates.variables(thread(null, "  "));
        assertThat(v).containsEntry("name", "").doesNotContainKey("product");
        assertThat(ReplyTemplateService.fill("Hi {name}, {product} {ttn}", v)).isEqualTo("Hi , {product} {ttn}");
    }

    @Test
    void forThread_rendersInTheCustomersLanguage() {
        SupportThread t = thread("Олексій", "Wooting 60HE");
        when(lookup.load("tid")).thenReturn(t);
        when(messages.localeOf(77L)).thenReturn(Locale.forLanguageTag("uk"));
        List<RenderedTemplateDto> out = List.of(new RenderedTemplateDto(1L, "T", "text", "uk"));
        when(templates.renderAll(anyMap(), eq(Locale.forLanguageTag("uk")))).thenReturn(out);

        assertThat(new SupportReplyTemplates(lookup, templates, messages).forThread("tid")).isSameAs(out);
        verify(templates).renderAll(eq(Map.of("name", "Олексій", "product", "Wooting 60HE")), eq(Locale.forLanguageTag("uk")));
    }
}
