package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.ReplyTemplate;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.ReplyTemplateRepository;
import com.maxsolch.shop.translation.ContentTranslation;
import com.maxsolch.shop.translation.ContentTranslationId;
import com.maxsolch.shop.translation.ContentTranslationRepository;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationOrigin;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.TemplateDto;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.TemplateUpsertRequest;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.RenderedTemplateDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReplyTemplateServiceTest {

    @Mock
    ReplyTemplateRepository repository;
    @Mock
    OrderRepository orderRepository;
    @Mock
    Messages messages;
    @Mock
    ContentTranslationRepository translations;
    @Mock
    TranslationService translationService;

    private ReplyTemplateService service() {
        return new ReplyTemplateService(repository, orderRepository, messages, translations, translationService);
    }

    private static ReplyTemplate template(String ru) {
        ReplyTemplate t = new ReplyTemplate();
        t.setId(1L);
        t.setTitle("T");
        t.setBodyRu(ru);
        return t;
    }

    /** A uk/en translation of template 1 made for {@code forSource}. */
    private static ContentTranslation tr(String locale, String text, String forSource) {
        ContentTranslation row = new ContentTranslation(new ContentTranslationId(TranslationEntityType.REPLY_TEMPLATE,
                ReplyTemplate.translationId(1L), TranslationEntityType.BODY, locale));
        row.setText(text);
        row.setSourceHash(TranslationService.sha256Hex(forSource));
        row.setOrigin(TranslationOrigin.AI);
        return row;
    }

    @Test
    void translationId_keepsTheNumericIdInTheLowBytes() {
        assertThat(ReplyTemplate.translationKey(10L)).isEqualTo("00000000-0000-0000-0000-00000000000a");
        assertThat(ReplyTemplate.idOfTranslationId(ReplyTemplate.translationId(4242L))).isEqualTo(4242L);
        assertThat(ReplyTemplate.idOfTranslationId(new byte[16])).isEqualTo(0L);
        byte[] uuid = new byte[16];
        uuid[0] = 1;
        assertThat(ReplyTemplate.idOfTranslationId(uuid)).isNull();
    }

    @Test
    void fill_replacesKnownPlaceholders_keepsUnknownOnes() {
        String out = ReplyTemplateService.fill("Привет, {name}! #{orderNo} {oops} $1 \\",
                Map.of("name", "Іван", "orderNo", "abcd1234"));
        assertThat(out).isEqualTo("Привет, Іван! #abcd1234 {oops} $1 \\");
    }

    @Test
    void pick_prefersCustomerLanguage_thenUkrainian_thenRussian() {
        assertThat(ReplyTemplateService.pick("ru", "uk", "en", "en").body()).isEqualTo("en");
        assertThat(ReplyTemplateService.pick("ru", "uk", "en", "ru").body()).isEqualTo("ru");
        assertThat(ReplyTemplateService.pick("ru", "uk", "en", "uk").body()).isEqualTo("uk");

        assertThat(ReplyTemplateService.pick("ru", null, " ", "en").lang()).isEqualTo("ru");
        assertThat(ReplyTemplateService.pick("ru", null, " ", "uk").lang()).isEqualTo("ru");

        assertThat(ReplyTemplateService.pick("ru", "uk", null, "en").lang()).isEqualTo("uk");
    }

    @Test
    void money_formatsWholeHryvniasWithSpaces() {
        assertThat(ReplyTemplateService.money(125_000)).isEqualTo("1 250 ₴");
        assertThat(ReplyTemplateService.money(0)).isEqualTo("0 ₴");
    }

    @Test
    void renderForOrder_fillsOrderValuesInCustomerLanguage() {
        ReplyTemplateService service = service();
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        o.setTgUserId(42L);
        o.setCustomerName("Іван");
        o.setTotalMinor(100_000);
        o.setReceivedMinor(20_000);
        o.setTrackingNumber("20450000000001");
        o.setDeliveryMethod(DeliveryMethod.NOVA_POSHTA);
        o.setNpCityName("Київ");
        o.setNpWarehouseName("Відділення №1");
        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o));
        when(messages.localeOf(42L)).thenReturn(Locale.forLanguageTag("uk"));
        when(repository.findAllByOrderBySortAscIdAsc()).thenReturn(List.of(template("RU {name}")));
        when(translations.findByType(TranslationEntityType.REPLY_TEMPLATE)).thenReturn(List.of(
                tr("uk", "{name}: {total}, наложка {cod}, ТТН {ttn}, {warehouse}", "RU {name}")));

        List<RenderedTemplateDto> out = service.renderForOrder(o.getId());

        assertThat(out).hasSize(1);
        assertThat(out.get(0).locale()).isEqualTo("uk");
        assertThat(out.get(0).text()).isEqualTo(
                "Іван: 1 000 ₴, наложка 800 ₴, ТТН 20450000000001, Київ, Відділення №1");
    }

    @Test
    void renderForOrder_staleTranslationIsNotUsed() {
        ReplyTemplateService service = service();
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        o.setTgUserId(42L);
        o.setCustomerName("Іван");
        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o));
        when(messages.localeOf(42L)).thenReturn(Locale.forLanguageTag("uk"));
        when(repository.findAllByOrderBySortAscIdAsc()).thenReturn(List.of(template("Новый текст {name}")));
        when(translations.findByType(TranslationEntityType.REPLY_TEMPLATE))
                .thenReturn(List.of(tr("uk", "Старий текст {name}", "Старый текст {name}")));

        RenderedTemplateDto out = service.renderForOrder(o.getId()).get(0);

        assertThat(out.locale()).isEqualTo("ru");
        assertThat(out.text()).isEqualTo("Новый текст Іван");
    }

    @Test
    void list_marksTranslationsOfAnOlderRussianTextStale() {
        when(repository.findAllByOrderBySortAscIdAsc()).thenReturn(List.of(template("Новый")));
        when(translations.findByType(TranslationEntityType.REPLY_TEMPLATE))
                .thenReturn(List.of(tr("uk", "Новий", "Новый"), tr("en", "Old", "Старый")));

        TemplateDto dto = service().list().get(0);

        assertThat(dto.bodyUk()).isEqualTo("Новий");
        assertThat(dto.ukStale()).isFalse();
        assertThat(dto.bodyEn()).isEqualTo("Old");
        assertThat(dto.enStale()).isTrue();
    }

    @Test
    void update_russianOnlyEdit_leavesTranslationsStale_editedOneBecomesManual_blankRemoves() {
        ReplyTemplate t = template("Старый");
        when(repository.findById(1L)).thenReturn(Optional.of(t));
        when(repository.save(any(ReplyTemplate.class))).thenAnswer(i -> i.getArgument(0));
        ContentTranslation uk = tr("uk", "Старий", "Старый");
        ContentTranslation en = tr("en", "Old", "Старый");
        when(translations.findForEntity(eq(TranslationEntityType.REPLY_TEMPLATE), any())).thenReturn(List.of(uk, en));
        List<ContentTranslation> saved = new ArrayList<>();
        when(translations.save(any(ContentTranslation.class))).thenAnswer(i -> {
            saved.add(i.getArgument(0));
            return i.getArgument(0);
        });

        // uk sent back unchanged, en cleared
        service().update(1L, new TemplateUpsertRequest("T", "Новый", "Старий", " ", null));

        assertThat(saved).isEmpty();
        assertThat(uk.getSourceHash()).isEqualTo(TranslationService.sha256Hex("Старый"));
        verify(translations).delete(en);

        // uk retyped by the admin → MANUAL, made for the current Russian text
        service().update(1L, new TemplateUpsertRequest("T", "Новый", "Новий", null, null));

        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getText()).isEqualTo("Новий");
        assertThat(saved.get(0).getOrigin()).isEqualTo(TranslationOrigin.MANUAL);
        assertThat(saved.get(0).getSourceHash()).isEqualTo(TranslationService.sha256Hex("Новый"));
        verify(translations, never()).delete(uk);
    }
}
