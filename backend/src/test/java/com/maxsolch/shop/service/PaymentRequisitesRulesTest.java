package com.maxsolch.shop.service;

import com.maxsolch.shop.web.dto.PaymentRequisitesDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** A11 / R10: requisites are validated and every change is logged as a masked diff. */
class PaymentRequisitesRulesTest {

    private static final String CARD = "4111 1111 1111 1111";
    private static final String IBAN = "UA21 3223 1300 0002 6007 2335 6600 1";

    private static PaymentRequisitesDto req(String card, String iban, String recipient) {
        return new PaymentRequisitesDto(card, iban, recipient, "12345678", "Оплата заказа", "Пришлите квитанцию");
    }

    @Test
    void cardIsCheckedWithLuhn() {
        assertThat(PaymentRequisitesRules.validCard(CARD)).isTrue();
        assertThat(PaymentRequisitesRules.validCard("4111-1111-1111-1112")).isFalse();
        assertThat(PaymentRequisitesRules.validCard("4111")).isFalse();
        assertThat(PaymentRequisitesRules.validCard("")).isTrue(); // no card is allowed
    }

    @Test
    void ibanMustBeUkrainianWithAValidChecksum() {
        assertThat(PaymentRequisitesRules.validIban(IBAN)).isTrue();
        assertThat(PaymentRequisitesRules.validIban("ua213223130000026007233566001")).isTrue();
        assertThat(PaymentRequisitesRules.validIban("UA223223130000026007233566001")).isFalse(); // checksum
        assertThat(PaymentRequisitesRules.validIban("UA21322313000002600723356600")).isFalse(); // 26 digits
        assertThat(PaymentRequisitesRules.validIban("DE89370400440532013000")).isFalse();
        assertThat(PaymentRequisitesRules.validIban(null)).isTrue();
    }

    @Test
    void onlyChangedFieldsAreValidated() {
        PaymentRequisitesDto legacy = req("1234", IBAN, "ФОП Иванов");
        // The stored card predates the rule; editing only the note must still save.
        assertThat(PaymentRequisitesRules.problem(legacy, req("1234", IBAN, "ФОП Иванов"))).isNull();
        assertThat(PaymentRequisitesRules.problem(legacy, req("5555", IBAN, "ФОП Иванов"))).contains("Luhn");
        assertThat(PaymentRequisitesRules.problem(legacy, req("1234", "UA00", "ФОП Иванов"))).contains("IBAN");
    }

    @Test
    void diffIsMaskedAndNeverContainsTheFullNumbers() {
        PaymentRequisitesDto before = req(CARD, IBAN, "ФОП Иванов");
        PaymentRequisitesDto after = req("5555 5555 5555 4444", "UA903052992990004149123456789", "ФОП Петров");

        List<String> diff = PaymentRequisitesRules.diff(before, after);

        assertThat(diff).containsExactly(
                "карта ****1111 → ****4444",
                "IBAN UA…6001 → UA…6789",
                "получатель «ФОП Иванов» → «ФОП Петров»");
        assertThat(String.join(" ", diff)).doesNotContain("5555 5555", "4111 1111", "3223");
        assertThat(PaymentRequisitesRules.moneyCritical(before, after)).isTrue();
    }

    @Test
    void textOnlyChangesAreNotMoneyCritical() {
        PaymentRequisitesDto before = req(CARD, IBAN, "ФОП Иванов");
        PaymentRequisitesDto after = new PaymentRequisitesDto(CARD, IBAN, "ФОП Иванов", "12345678",
                "Оплата заказа", "Новый текст");

        assertThat(PaymentRequisitesRules.diff(before, after)).containsExactly("примечание изменено");
        assertThat(PaymentRequisitesRules.moneyCritical(before, after)).isFalse();
        assertThat(PaymentRequisitesRules.diff(before, before)).isEmpty();
    }
}
