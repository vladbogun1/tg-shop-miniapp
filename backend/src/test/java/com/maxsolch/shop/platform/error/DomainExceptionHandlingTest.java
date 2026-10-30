package com.maxsolch.shop.platform.error;

import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.platform.i18n.CustomerLanguages;
import com.maxsolch.shop.platform.i18n.Messages;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.ResponseEntity;

import java.util.Locale;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** The JSON error body must stay {timestamp,status,error,message,code?}; the text comes from the real bundles. */
class DomainExceptionHandlingTest {

    private final ResourceBundleMessageSource source = bundles();
    private final Messages messages = new Messages(source, mock(CustomerLanguages.class));
    private final ApiExceptionHandler handler = new ApiExceptionHandler(messages, java.time.Clock.systemUTC());

    private static ResourceBundleMessageSource bundles() {
        ResourceBundleMessageSource s = new ResourceBundleMessageSource();
        s.setBasename("i18n/messages");
        s.setDefaultEncoding("UTF-8");
        s.setFallbackToSystemLocale(false);
        return s;
    }

    @AfterEach
    void resetLocale() {
        LocaleContextHolder.resetLocaleContext();
    }

    @Test
    void textAndCodeComeFromTheErrorCode() {
        LocaleContextHolder.setLocale(Locale.forLanguageTag("ru"));
        ResponseEntity<Map<String, Object>> res =
                handler.handleDomain(new DomainException.NotFound(OrderError.ORDER_NOT_FOUND));

        assertThat(res.getStatusCode().value()).isEqualTo(404);
        assertThat(res.getBody()).containsEntry("message", "Заказ не найден").containsEntry("status", 404)
                .doesNotContainKey("code");
    }

    @Test
    void textIsInTheLanguageOfTheRequestAndTakesArguments() {
        LocaleContextHolder.setLocale(Locale.forLanguageTag("ru"));
        DomainException e = new DomainException.BadRequest(OrderError.TOO_MANY_UNPAID, 3);

        String ru = (String) handler.handleDomain(e).getBody().get("message");
        LocaleContextHolder.setLocale(Locale.forLanguageTag("en"));
        String en = (String) handler.handleDomain(e).getBody().get("message");

        assertThat(ru).startsWith("У вас уже 3 неоплаченных");
        assertThat(en).isNotEqualTo(ru).contains("3");
        assertThat(e.getMessage()).isEqualTo(ru);
        assertThat(handler.handleDomain(e).getBody()).containsEntry("code", "TOO_MANY_UNPAID");
    }

    @Test
    void kindFixesTheStatus() {
        assertThat(handler.handleDomain(new DomainException.Forbidden(OrderError.ORDER_NOT_FOUND)).getStatusCode().value()).isEqualTo(403);
        assertThat(handler.handleDomain(new DomainException.Unauthorized(OrderError.ORDER_NOT_FOUND)).getStatusCode().value()).isEqualTo(401);
        assertThat(handler.handleDomain(new DomainException.Unavailable(OrderError.ORDER_NOT_FOUND)).getStatusCode().value()).isEqualTo(503);
    }

    @Test
    void conflictDetailsAreMergedIntoBody() {
        ResponseEntity<Map<String, Object>> res = handler.handleDomain(
                new DomainException.Conflict(OrderError.PAYMENT_IN_PROGRESS).withDetails(Map.of("count", 3)));

        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(res.getBody()).containsEntry("code", "PAYMENT_IN_PROGRESS").containsEntry("count", 3);
    }

    @Test
    void tooManyRequestsSetsRetryAfterHeaderAndField() {
        ResponseEntity<Map<String, Object>> res =
                handler.handleDomain(new DomainException.TooManyRequests(OrderError.ORDER_COOLDOWN, 30, 30));

        assertThat(res.getStatusCode().value()).isEqualTo(429);
        assertThat(res.getHeaders().getFirst("Retry-After")).isEqualTo("30");
        assertThat(res.getBody()).containsEntry("retryAfterSec", 30L).containsEntry("code", "ORDER_COOLDOWN");
    }

    @Test
    void tooManyRequestsWithoutWaitHasNoHeader() {
        ResponseEntity<Map<String, Object>> res =
                handler.handleDomain(new DomainException.TooManyRequests(OrderError.ORDER_COOLDOWN, 0, 0));

        assertThat(res.getHeaders().containsKey("Retry-After")).isFalse();
        assertThat(res.getBody()).doesNotContainKey("retryAfterSec");
    }
}
