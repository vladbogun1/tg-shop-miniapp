package com.maxsolch.shop.platform.error;

import com.maxsolch.shop.platform.i18n.Messages;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The JSON error body must stay {timestamp,status,error,message,code?} whichever way the exception is built. */
class DomainExceptionHandlingTest {

    private enum TestError implements ErrorCode {
        SOME_REASON;

        @Override
        public String code() {
            return name();
        }
    }

    private final Messages messages = mock(Messages.class);
    private final ApiExceptionHandler handler = new ApiExceptionHandler(messages, java.time.Clock.systemUTC());

    @Test
    void readyTextWithCodeKeepsLegacyShape() {
        ResponseEntity<Map<String, Object>> res =
                handler.handleDomain(new DomainException.BadRequest("готовий текст", TestError.SOME_REASON));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody()).containsEntry("message", "готовий текст")
                .containsEntry("code", "SOME_REASON").containsEntry("status", 400);
    }

    @Test
    void textIsLookedUpByCodeWithArguments() {
        when(messages.current(eq("error.SOME_REASON"), any(Object[].class))).thenReturn("Не знайдено 42");

        ResponseEntity<Map<String, Object>> res =
                handler.handleDomain(new DomainException.NotFound(TestError.SOME_REASON, 42));

        assertThat(res.getStatusCode().value()).isEqualTo(404);
        assertThat(res.getBody()).containsEntry("message", "Не знайдено 42").containsEntry("code", "SOME_REASON");
    }

    @Test
    void readyTextExceptionsMapToTheirStatus() {
        assertThat(handler.handleDomain(new DomainException.NotFound("нема")).getBody())
                .containsEntry("message", "нема").doesNotContainKey("code");
        assertThat(handler.handleDomain(new DomainException.Forbidden("ні")).getStatusCode().value()).isEqualTo(403);
        assertThat(handler.handleDomain(new DomainException.Unauthorized("хто", null)).getStatusCode().value()).isEqualTo(401);
        assertThat(handler.handleDomain(new DomainException.BadRequest("x", ErrorCode.of("C"))).getBody()).containsEntry("code", "C");
    }

    @Test
    void conflictDetailsAreMergedIntoBody() {
        ResponseEntity<Map<String, Object>> res =
                handler.handleDomain(new DomainException.Conflict("зміни", ErrorCode.of("STOCK_CONFLICT"), Map.of("count", 3)));

        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(res.getBody()).containsEntry("code", "STOCK_CONFLICT").containsEntry("count", 3);
    }

    @Test
    void tooManyRequestsSetsRetryAfterHeaderAndField() {
        ResponseEntity<Map<String, Object>> res =
                handler.handleDomain(new DomainException.TooManyRequests("зачекайте", ErrorCode.of("ORDER_COOLDOWN"), 30));

        assertThat(res.getStatusCode().value()).isEqualTo(429);
        assertThat(res.getHeaders().getFirst("Retry-After")).isEqualTo("30");
        assertThat(res.getBody()).containsEntry("retryAfterSec", 30L).containsEntry("code", "ORDER_COOLDOWN");
    }

    @Test
    void tooManyRequestsWithoutWaitHasNoHeader() {
        ResponseEntity<Map<String, Object>> res =
                handler.handleDomain(new DomainException.TooManyRequests("зачекайте", ErrorCode.of("X"), 0));

        assertThat(res.getHeaders().containsKey("Retry-After")).isFalse();
        assertThat(res.getBody()).doesNotContainKey("retryAfterSec");
    }
}
