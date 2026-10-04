package com.maxsolch.shop.translation;

import com.maxsolch.shop.translation.TranslationService.Entry;
import com.maxsolch.shop.translation.TranslationService.Key;
import com.maxsolch.shop.web.dto.PaymentRequisitesDto;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Р9: the requisites note/purpose are shown in the customer's language; numbers never change. */
class RequisitesTranslationTest {

    private static final String NOTE = "После оплаты пришлите квитанцию";
    private static final PaymentRequisitesDto RU = new PaymentRequisitesDto(
            "4111111111111111", "UA213223130000026007233566001", "ФОП Иванов", "12345678", "Оплата заказа", NOTE);

    private static Key key(String field) {
        return new Key(TranslationEntityType.PAYMENT_REQUISITES, TranslationEntityType.REQUISITES_ID, field);
    }

    @Test
    void currentTranslationsReplaceNoteAndPurposeOnly() {
        TranslationService.Overlay overlay = new TranslationService.Overlay(Map.of(
                key("note"), new Entry("Після оплати надішліть квитанцію", TranslationService.sha256Hex(NOTE),
                        TranslationOrigin.AI),
                key("purpose"), new Entry("Оплата замовлення", TranslationService.sha256Hex("Оплата заказа"),
                        TranslationOrigin.AI)));

        PaymentRequisitesDto uk = overlay.requisites(RU);

        assertThat(uk.note()).isEqualTo("Після оплати надішліть квитанцію");
        assertThat(uk.purpose()).isEqualTo("Оплата замовлення");
        assertThat(uk.cardNumber()).isEqualTo(RU.cardNumber());
        assertThat(uk.iban()).isEqualTo(RU.iban());
        assertThat(uk.recipient()).isEqualTo(RU.recipient());
    }

    @Test
    void staleTranslationFallsBackToRussian() {
        TranslationService.Overlay overlay = new TranslationService.Overlay(Map.of(
                key("note"), new Entry("Старий текст", TranslationService.sha256Hex("старый русский"),
                        TranslationOrigin.AI)));

        assertThat(overlay.requisites(RU).note()).isEqualTo(NOTE);
    }

    @Test
    void requisitesAreATranslatableEntity() {
        assertThat(TranslationEntityType.parse("payment_requisites")).isEqualTo(TranslationEntityType.PAYMENT_REQUISITES);
        assertThat(TranslationEntityType.PAYMENT_REQUISITES.allows("note")).isTrue();
        assertThat(TranslationEntityType.PAYMENT_REQUISITES.allows("card_number")).isFalse();
    }
}
