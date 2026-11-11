package com.maxsolch.shop.delivery.api;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The public webhook reads at most 64 KB of a body. */
class NpWebhookControllerTest {

    @Test
    void webhookBodyIsCapped() throws IOException {
        MockHttpServletRequest ok = new MockHttpServletRequest("POST", "/api/np/webhook");
        ok.setContent("{\"a\":1}".getBytes());
        assertThat(NpWebhookController.readCapped(ok)).isEqualTo("{\"a\":1}");

        MockHttpServletRequest big = new MockHttpServletRequest("POST", "/api/np/webhook");
        big.setContent(new byte[NpWebhookController.MAX_BODY + 1]);
        assertThatThrownBy(() -> NpWebhookController.readCapped(big)).isInstanceOf(IOException.class);
    }
}
