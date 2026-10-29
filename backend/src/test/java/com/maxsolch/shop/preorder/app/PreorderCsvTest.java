package com.maxsolch.shop.preorder.app;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PreorderCsvTest {

    @Test
    void emptyExportHasBomAndHeader() {
        String csv = PreorderCsv.build(List.of());

        assertThat(csv).startsWith("﻿name;username;qty;status;source;createdAt;botBlocked");
    }

    @Test
    void formulaCellsAreNeutralisedAndSeparatorsEscaped() {
        assertThat(PreorderCsv.cell("=1+1")).isEqualTo("'=1+1");
        assertThat(PreorderCsv.cell("a;b")).isEqualTo("\"a;b\"");
        assertThat(PreorderCsv.cell("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
    }
}
