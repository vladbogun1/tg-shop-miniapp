package com.maxsolch.shop.platform.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Nova Poshta takes Cyrillic names only: look-alike Latin letters inside a Cyrillic word are made Cyrillic. */
class CyrillicNamesTest {

    @Test
    void aLatinTwinInACyrillicWordIsSwapped() {
        // #e6e83c17, 13.11.2026: «Курзiн» with a Latin «i» → NP «LastName has invalid characters».
        assertThat(CyrillicNames.fixLookalikes("Курзiн")).isEqualTo("Курзін");
        assertThat(CyrillicNames.fixLookalikes("Пeтpенкo")).isEqualTo("Петренко");
        assertThat(CyrillicNames.fixLookalikes("Iван")).isEqualTo("Іван");
        assertThat(CyrillicNames.hasLatin(CyrillicNames.fixLookalikes("Курзiн Данил"))).isFalse();
    }

    @Test
    void apostrophesAndHyphensStayAndEachPartIsJudgedAlone() {
        assertThat(CyrillicNames.fixLookalikes("Mapія-Kатерина")).isEqualTo("Марія-Катерина");
        assertThat(CyrillicNames.fixLookalikes("Мар'янa")).isEqualTo("Мар'яна");
        assertThat(CyrillicNames.fixLookalikes("Ivan-Петров")).isEqualTo("Ivan-Петров");
    }

    @Test
    void aLatinNameIsLeftForAPersonToRewrite() {
        assertThat(CyrillicNames.fixLookalikes("John Smith")).isEqualTo("John Smith");
        assertThat(CyrillicNames.hasLatin("John Smith")).isTrue();
        assertThat(CyrillicNames.fixLookalikes("Kурзин Danylo")).isEqualTo("Курзин Danylo");
        assertThat(CyrillicNames.fixLookalikes(null)).isNull();
        assertThat(CyrillicNames.hasLatin(null)).isFalse();
    }
}
