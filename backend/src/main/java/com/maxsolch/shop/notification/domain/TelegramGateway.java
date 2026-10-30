package com.maxsolch.shop.notification.domain;

import org.telegram.telegrambots.meta.api.methods.BotApiMethod;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.io.Serializable;

/**
 * The one door to the Telegram Bot API for sending. Every outgoing call (messages, edits, deletes, documents) goes
 * through it, so the timeouts live in one place ({@code TelegramSender}) and tests replace it with a mock.
 *
 * <p>No call is retried here: {@code sendMessage} is not idempotent (a retry after a lost answer would show the
 * customer the same message twice), so a failure is reported to the caller, who journals it and moves on.
 */
public interface TelegramGateway {

    <T extends Serializable, M extends BotApiMethod<T>> T execute(M method) throws TelegramApiException;

    Message execute(SendDocument document) throws TelegramApiException;
}
