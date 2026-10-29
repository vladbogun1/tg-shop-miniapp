package com.maxsolch.shop.payment.api;

import com.maxsolch.shop.payment.app.MonobankWebhooks;
import com.maxsolch.shop.payment.app.MonobankWebhooks.Outcome;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The controller only maps the use case's outcome to the HTTP code monobank acts on. */
class MonobankWebhookControllerTest {

    private static int statusFor(Outcome outcome) {
        MonobankWebhooks webhooks = mock(MonobankWebhooks.class);
        when(webhooks.handle(any(), any())).thenReturn(outcome);
        return new MonobankWebhookController(webhooks).webhook(new byte[] {1}, "sig").getStatusCode().value();
    }

    @Test
    void outcomesBecomeTheCodesTheBankExpects() {
        assertThat(statusFor(Outcome.IGNORED)).isEqualTo(400);
        assertThat(statusFor(Outcome.UNREADABLE)).isEqualTo(400);
        assertThat(statusFor(Outcome.BAD_SIGNATURE)).isEqualTo(401);
        assertThat(statusFor(Outcome.APPLIED)).isEqualTo(200);
    }
}
