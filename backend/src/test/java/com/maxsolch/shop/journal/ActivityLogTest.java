package com.maxsolch.shop.journal;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.telegram.telegrambots.meta.api.objects.ApiResponse;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;
import org.telegram.telegrambots.meta.exceptions.TelegramApiRequestException;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** «Журнал → Бот и сайт»: failure reasons of the bot, what a row holds, and that it never breaks the caller. */
class ActivityLogTest {

    private JdbcTemplate jdbc;
    private ActivityLog log;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        log = new ActivityLog(jdbc, new DirectExecutor());
    }

    static TelegramApiRequestException apiError(int code, String description, Integer retryAfter) throws Exception {
        String json = "{\"ok\":false,\"error_code\":" + code + ",\"description\":\"" + description + "\""
                + (retryAfter == null ? "" : ",\"parameters\":{\"retry_after\":" + retryAfter + "}") + "}";
        ApiResponse<?> response = new ObjectMapper().readValue(json, ApiResponse.class);
        return new TelegramApiRequestException("Error sending message", response);
    }

    // ------------------------------------------------------------------ reasons

    @Test
    void telegramErrorsAreClassified() throws Exception {
        assertThat(ActivityLog.classify(apiError(403, "Forbidden: bot was blocked by the user", null)).code())
                .isEqualTo("BOT_BLOCKED");
        assertThat(ActivityLog.classify(apiError(403, "Forbidden: user is deactivated", null)).code())
                .isEqualTo("USER_DEACTIVATED");
        assertThat(ActivityLog.classify(apiError(403, "Forbidden: bot can't initiate conversation with a user", null)).code())
                .isEqualTo("NOT_STARTED");
        assertThat(ActivityLog.classify(apiError(400, "Bad Request: chat not found", null)).code())
                .isEqualTo("CHAT_NOT_FOUND");
        assertThat(ActivityLog.classify(apiError(400, "Bad Request: can't parse entities: unsupported tag", null)).code())
                .isEqualTo("BAD_MARKUP");
        assertThat(ActivityLog.classify(apiError(400, "Bad Request: message is too long", null)).code())
                .isEqualTo("BAD_REQUEST");

        ActivityLog.Failure limited = ActivityLog.classify(apiError(429, "Too Many Requests: retry after 7", 7));
        assertThat(limited.code()).isEqualTo("RATE_LIMITED");
        assertThat(limited.message()).startsWith("[429]").contains("retry after 7 s");
    }

    @Test
    void networkFailuresAndUnknownErrors() {
        assertThat(ActivityLog.classify(new TelegramApiException("Unable to execute sendmessage method",
                new IOException("Connect timed out"))).code()).isEqualTo("NETWORK");
        assertThat(ActivityLog.classify(new IllegalStateException("boom")).code()).isEqualTo("ERROR");
    }

    @Test
    void botTokenNeverReachesTheJournal() {
        ActivityLog.Failure f = ActivityLog.classify(new TelegramApiException(
                "Unable to execute https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/sendMessage",
                new IOException("reset")));
        assertThat(f.message()).doesNotContain("AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw").contains("bot***");
    }

    @Test
    void previewIsPlainTextOfTheHtmlMessage() {
        assertThat(ActivityLog.plain("✅ <b>Одобрен</b>\nЗаказ <b>#1a2b3c4d</b>\n<i>Скоро</i> &amp; всё"))
                .isEqualTo("✅ Одобрен Заказ #1a2b3c4d Скоро & всё");
        assertThat(ActivityLog.plain("x".repeat(900))).hasSize(500);
        assertThat(ActivityLog.plain("  ")).isNull();
    }

    @Test
    void refusedRequestsKeepTheApiCode() {
        ActivityLog.Entry e = ActivityLog.Entry.of(ActivityLog.SITE, "PAYMENT_START_FAILED")
                .rejected(new ConflictException("Час на оплату минув", "PAYMENT_EXPIRED"));
        assertThat(e.resultCode()).isEqualTo(ActivityLog.FAILED);
        assertThat(e.errorCode()).isEqualTo("PAYMENT_EXPIRED");
        assertThat(ActivityLog.Entry.of(ActivityLog.SITE, "X").rejected(new BadRequestException("нет")).errorCode())
                .isEqualTo("BAD_REQUEST");
    }

    // ------------------------------------------------------------------ recording

    @Test
    void deliveredBotMessageIsWrittenAsOk() throws Exception {
        byte[] orderId = UuidUtil.randomBytes();
        String result = log.bot(ActivityLog.Entry.bot("ORDER_STATUS").toCustomer(42L).order(orderId)
                .text("<b>Одобрен</b>"), () -> "sent");

        assertThat(result).isEqualTo("sent");
        Object[] row = insertedRow();
        // created_at, source, type, result, recipient, tg_user_id, chat_id, order_id, group_id, summary, error_code, error, details
        assertThat(row[1]).isEqualTo("BOT");
        assertThat(row[2]).isEqualTo("ORDER_STATUS");
        assertThat(row[3]).isEqualTo("OK");
        assertThat(row[4]).isEqualTo("CUSTOMER");
        assertThat(row[5]).isEqualTo(42L);
        assertThat(row[6]).isEqualTo(42L);
        assertThat(row[7]).isEqualTo(orderId);
        assertThat(row[9]).isEqualTo("Одобрен");
        assertThat(row[10]).isNull();
    }

    @Test
    void undeliveredBotMessageIsWrittenWithTheReasonAndTheErrorStillReachesTheCaller() throws Exception {
        TelegramApiRequestException blocked = apiError(403, "Forbidden: bot was blocked by the user", null);

        assertThatThrownBy(() -> log.bot(ActivityLog.Entry.bot("BROADCAST").toCustomer(7L)
                .group(ActivityLog.broadcastGroup(12)).detail("lang", "uk"), () -> {
            throw blocked;
        })).isSameAs(blocked);

        Object[] row = insertedRow();
        assertThat(row[3]).isEqualTo("FAILED");
        assertThat(row[8]).isEqualTo("broadcast:12");
        assertThat(row[10]).isEqualTo("BOT_BLOCKED");
        assertThat((String) row[11]).contains("[403]").contains("blocked");
        assertThat(row[12]).isEqualTo("{\"lang\":\"uk\"}");
    }

    @Test
    void customerOfAnOrderIsLookedUpWhenNotGiven() {
        byte[] orderId = UuidUtil.randomBytes();
        when(jdbc.queryForList(anyString(), eq(Long.class), any(Object[].class))).thenReturn(List.of(555L));

        log.record(ActivityLog.Entry.of(ActivityLog.PAYMENT, "PAYMENT_SUCCESS").order(orderId));

        assertThat(insertedRow()[5]).isEqualTo(555L);
    }

    @Test
    void adminMessagesAreNotAttributedToTheGroupChat() {
        log.record(ActivityLog.Entry.bot("ADMIN_ORDER_CARD").toAdmins("-1001234567890").text("Карточка"));

        Object[] row = insertedRow();
        assertThat(row[4]).isEqualTo("ADMINS");
        assertThat(row[5]).isNull();
        assertThat(row[6]).isEqualTo(-1001234567890L);
        verify(jdbc, never()).queryForList(anyString(), eq(Long.class), any(Object[].class));
    }

    @Test
    void aBrokenDatabaseNeverReachesTheCaller() throws Exception {
        when(jdbc.update(anyString(), any(Object[].class))).thenThrow(new IllegalStateException("db down"));

        String r = log.bot(ActivityLog.Entry.bot("START").toCustomer(1L), () -> "ok");
        log.record(ActivityLog.Entry.of(ActivityLog.SITE, "LOGIN"));

        assertThat(r).isEqualTo("ok");
    }

    @Test
    void aFullQueueDropsEntriesInsteadOfBlocking() {
        ActivityLog full = new ActivityLog(jdbc, new DirectExecutor() {
            @Override
            public void execute(Runnable command) {
                throw new java.util.concurrent.RejectedExecutionException("full");
            }
        });
        full.record(ActivityLog.Entry.of(ActivityLog.SITE, "LOGIN"));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    private Object[] insertedRow() {
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(org.mockito.ArgumentMatchers.startsWith("INSERT INTO activity_log"), args.capture());
        return args.getValue();
    }

    /** Runs tasks on the calling thread, so a test sees the row right away. */
    static class DirectExecutor extends AbstractExecutorService {
        @Override
        public void execute(Runnable command) {
            command.run();
        }

        @Override
        public void shutdown() {
        }

        @Override
        public List<Runnable> shutdownNow() {
            return List.of();
        }

        @Override
        public boolean isShutdown() {
            return false;
        }

        @Override
        public boolean isTerminated() {
            return false;
        }

        @Override
        public boolean awaitTermination(long timeout, TimeUnit unit) {
            return true;
        }
    }
}
