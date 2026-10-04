package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.PaymentRequisites;
import com.maxsolch.shop.domain.ReplyTemplate;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PaymentRequisitesRepository;
import com.maxsolch.shop.repository.ReplyTemplateRepository;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.RenderedTemplateDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReplyTemplateServiceTest {

    @Mock
    ReplyTemplateRepository repository;
    @Mock
    OrderRepository orderRepository;
    @Mock
    PaymentRequisitesRepository requisitesRepository;
    @Mock
    Messages messages;

    private static ReplyTemplate template(String ru, String uk, String en) {
        ReplyTemplate t = new ReplyTemplate();
        t.setId(1L);
        t.setTitle("T");
        t.setBodyRu(ru);
        t.setBodyUk(uk);
        t.setBodyEn(en);
        return t;
    }

    @Test
    void fill_replacesKnownPlaceholders_keepsUnknownOnes() {
        String out = ReplyTemplateService.fill("Привет, {name}! #{orderNo} {oops} $1 \\",
                Map.of("name", "Іван", "orderNo", "abcd1234"));
        assertThat(out).isEqualTo("Привет, Іван! #abcd1234 {oops} $1 \\");
    }

    @Test
    void pick_prefersCustomerLanguage_thenUkrainian_thenRussian() {
        ReplyTemplate full = template("ru", "uk", "en");
        assertThat(ReplyTemplateService.pick(full, "en").body()).isEqualTo("en");
        assertThat(ReplyTemplateService.pick(full, "ru").body()).isEqualTo("ru");
        assertThat(ReplyTemplateService.pick(full, "uk").body()).isEqualTo("uk");

        ReplyTemplate ruOnly = template("ru", null, " ");
        assertThat(ReplyTemplateService.pick(ruOnly, "en").lang()).isEqualTo("ru");
        assertThat(ReplyTemplateService.pick(ruOnly, "uk").lang()).isEqualTo("ru");

        ReplyTemplate noEn = template("ru", "uk", null);
        assertThat(ReplyTemplateService.pick(noEn, "en").lang()).isEqualTo("uk");
    }

    @Test
    void money_formatsWholeHryvniasWithSpaces() {
        assertThat(ReplyTemplateService.money(125_000)).isEqualTo("1 250 ₴");
        assertThat(ReplyTemplateService.money(0)).isEqualTo("0 ₴");
    }

    @Test
    void renderForOrder_fillsOrderValuesInCustomerLanguage() {
        ReplyTemplateService service =
                new ReplyTemplateService(repository, orderRepository, requisitesRepository, messages);
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
        PaymentRequisites req = new PaymentRequisites();
        req.setCardNumber("5375 0000 0000 0000");
        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o));
        when(messages.localeOf(42L)).thenReturn(Locale.forLanguageTag("uk"));
        when(messages.get(any(Locale.class), anyString())).thenAnswer(inv -> "Картка");
        when(requisitesRepository.findById(1)).thenReturn(Optional.of(req));
        when(repository.findAllByOrderBySortAscIdAsc()).thenReturn(List.of(
                template("RU {name}", "{name}: {total}, наложка {cod}, ТТН {ttn}, {warehouse}\n{requisites}", null)));

        List<RenderedTemplateDto> out = service.renderForOrder(o.getId());

        assertThat(out).hasSize(1);
        assertThat(out.get(0).locale()).isEqualTo("uk");
        assertThat(out.get(0).text()).isEqualTo(
                "Іван: 1 000 ₴, наложка 800 ₴, ТТН 20450000000001, Київ, Відділення №1\nКартка: 5375 0000 0000 0000");
    }
}
