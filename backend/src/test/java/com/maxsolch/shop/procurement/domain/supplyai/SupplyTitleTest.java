package com.maxsolch.shop.procurement.domain.supplyai;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SupplyTitleTest {

    @Test
    void keepsAReadableTitleOfTheAi() {
        assertThat(SupplyTitle.of("Taobao · X-Raypad — коврики и глайды", "XrayPad广东店"))
                .isEqualTo("Taobao · X-Raypad — коврики и глайды");
    }

    @Test
    void dropsHieroglyphsAndTheBracketsHoldingThem() {
        assertThat(SupplyTitle.clean("XrayPad Guangdong Store (XrayPad广东店)")).isEqualTo("XrayPad Guangdong Store");
        assertThat(SupplyTitle.clean("淘宝 PAN电竞")).isEqualTo("PAN");
        assertThat(SupplyTitle.clean("Taobao · 西城 — глайды")).isEqualTo("Taobao · глайды");
        assertThat(SupplyTitle.clean("Zpmax佳怡电竞海外仓")).isEqualTo("Zpmax");
    }

    @Test
    void fallsBackToTheShopWhenTheAiTitleIsOnlyHieroglyphs() {
        assertThat(SupplyTitle.of("游戏朋克电竞馆", "Zhijing Space Enterprise Store (智竞空间企业店)"))
                .isEqualTo("Zhijing Space Enterprise Store");
    }

    @Test
    void nothingReadableIsNull() {
        assertThat(SupplyTitle.of("游戏朋克电竞馆", "【】 · ")).isNull();
        assertThat(SupplyTitle.of(null, null)).isNull();
    }
}
