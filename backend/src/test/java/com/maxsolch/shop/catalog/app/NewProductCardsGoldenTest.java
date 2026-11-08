package com.maxsolch.shop.catalog.app;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Промпт нового товара на фиксированных данных совпадает символ в символ с эталоном, который строит админка
 * (frontend-admin/features/cards/model/prompt-golden.test.ts пишет и проверяет тот же файл).
 */
class NewProductCardsGoldenTest {

    private static final Path GOLDEN =
            Path.of("../frontend-admin/features/cards/model/golden/new-product-prompt.txt");

    @Test
    void promptEqualsAdminGolden() throws IOException {
        assumeTrue(Files.exists(GOLDEN), "нет ../frontend-admin — сверка с админкой пропущена");
        CatalogDirectory directory = mock(CatalogDirectory.class);
        when(directory.snapshot()).thenReturn(CardPromptFixtures.snapshot());

        String actual = new NewProductCards(directory).prompt(CardPromptFixtures.items());

        String golden = Files.readString(GOLDEN, StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertThat(actual).isEqualTo(golden);
    }
}
