package com.maxsolch.shop.delivery.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;


import static org.assertj.core.api.Assertions.assertThat;

/** Nova Poshta status codes → our parcel stages (docs/nova-poshta/tracking.md). */
class ShipmentStatusMapperTest {

    @ParameterizedTest
    @CsvSource({
            "1,CREATED", "12,CREATED",
            "2,CANCELLED",
            "3,NOT_FOUND",
            "4,IN_TRANSIT", "41,IN_TRANSIT", "5,IN_TRANSIT", "6,IN_TRANSIT", "101,IN_TRANSIT", "104,IN_TRANSIT",
            "7,ARRIVED", "8,ARRIVED",
            "9,RECEIVED", "10,RECEIVED", "11,RECEIVED", "106,RECEIVED",
            "103,REFUSED", "108,REFUSED",
            "102,RETURNING", "105,RETURNING",
    })
    void knownCodes(String code, ShipmentStage stage) {
        assertThat(ShipmentStatusMapper.stageOf(code)).isEqualTo(stage);
    }

    @Test
    void unknownAndBadCodesKeepTheStage() {
        assertThat(ShipmentStatusMapper.stageOf(null)).isNull();
        assertThat(ShipmentStatusMapper.stageOf("")).isNull();
        assertThat(ShipmentStatusMapper.stageOf("abc")).isNull();
        assertThat(ShipmentStatusMapper.stageOf("999")).isNull();
        assertThat(ShipmentStatusMapper.stageOf(" 7 ")).isEqualTo(ShipmentStage.ARRIVED);
    }

    @Test
    void handedOverMeansNovaPoshtaHasTheParcel() {
        assertThat(ShipmentStatusMapper.handedOver(ShipmentStage.CREATED)).isFalse();
        assertThat(ShipmentStatusMapper.handedOver(ShipmentStage.CANCELLED)).isFalse();
        assertThat(ShipmentStatusMapper.handedOver(ShipmentStage.NOT_FOUND)).isFalse();
        assertThat(ShipmentStatusMapper.handedOver(ShipmentStage.IN_TRANSIT)).isTrue();
        assertThat(ShipmentStatusMapper.handedOver(ShipmentStage.ARRIVED)).isTrue();
        assertThat(ShipmentStatusMapper.handedOver(ShipmentStage.RECEIVED)).isTrue();
        assertThat(ShipmentStatusMapper.handedOver(ShipmentStage.REFUSED)).isTrue();
        assertThat(ShipmentStatusMapper.handedOver(ShipmentStage.RETURNING)).isTrue();
    }

    @Test
    void terminalStages() {
        assertThat(ShipmentStage.RECEIVED.terminal()).isTrue();
        assertThat(ShipmentStage.CANCELLED.terminal()).isTrue();
        assertThat(ShipmentStage.ARRIVED.terminal()).isFalse();
        assertThat(ShipmentStage.RETURNING.terminal()).isFalse();
    }
}
