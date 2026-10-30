package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.journal.ActivityLog.Failure;
import com.maxsolch.shop.platform.journal.BotFailureClassifier;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.exceptions.TelegramApiRequestException;

import java.io.IOException;
import java.util.Locale;

/**
 * Why a Telegram call failed: a stable code for the journal's filters ({@code BOT_BLOCKED}, {@code RATE_LIMITED}, ...)
 * plus a readable, sanitised text (a bot token inside an error text never reaches the table).
 */
@Component
public class TelegramFailures implements BotFailureClassifier {

    @Override
    public Failure classify(Throwable t) {
        if (t == null) {
            return new Failure("ERROR", null);
        }
        Integer status = null;
        String api = null;
        Integer retryAfter = null;
        if (t instanceof TelegramApiRequestException r) {
            status = r.getErrorCode();
            api = r.getApiResponse();
            if (r.getParameters() != null) {
                retryAfter = r.getParameters().getRetryAfter();
            }
        }
        String text = (api != null ? api : String.valueOf(t.getMessage())).toLowerCase(Locale.ROOT);
        String full = (t.getMessage() == null ? "" : t.getMessage().toLowerCase(Locale.ROOT)) + " " + text;
        StringBuilder msg = new StringBuilder();
        if (status != null) {
            msg.append('[').append(status).append("] ");
        }
        msg.append(api != null ? api : t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage());
        if (retryAfter != null) {
            msg.append(" (retry after ").append(retryAfter).append(" s)");
        }
        return new Failure(code(t, status, full), ActivityLog.sanitize(msg.toString()));
    }

    private static String code(Throwable t, Integer status, String full) {
        if (Integer.valueOf(429).equals(status) || full.contains("too many requests") || full.contains("retry after")) {
            return "RATE_LIMITED";
        } else if (full.contains("bot was blocked")) {
            return "BOT_BLOCKED";
        } else if (full.contains("user is deactivated") || full.contains("deactivated")) {
            return "USER_DEACTIVATED";
        } else if (full.contains("bot can't initiate")) {
            return "NOT_STARTED";
        } else if (full.contains("chat not found")) {
            return "CHAT_NOT_FOUND";
        } else if (full.contains("bot was kicked") || full.contains("not a member")) {
            return "BOT_KICKED";
        } else if (full.contains("can't parse entities")) {
            return "BAD_MARKUP";
        } else if (full.contains("message thread not found") || full.contains("topic_closed")
                || full.contains("topic_deleted")) {
            return "TOPIC_NOT_FOUND";
        } else if (Integer.valueOf(403).equals(status) || full.contains("forbidden")) {
            return "FORBIDDEN";
        } else if (Integer.valueOf(400).equals(status) || full.contains("bad request")) {
            return "BAD_REQUEST";
        } else if (hasCause(t, IOException.class) || full.contains("unable to execute")
                || full.contains("timed out") || full.contains("connection")) {
            return "NETWORK";
        }
        return "ERROR";
    }

    private static boolean hasCause(Throwable t, Class<? extends Throwable> type) {
        for (Throwable c = t; c != null; c = c.getCause() == c ? null : c.getCause()) {
            if (type.isInstance(c)) {
                return true;
            }
        }
        return false;
    }
}
