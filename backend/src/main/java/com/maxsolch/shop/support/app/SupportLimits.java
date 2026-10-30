package com.maxsolch.shop.support.app;

import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.ErrorCode;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.support.app.SupportDtos.ConfigDto;
import com.maxsolch.shop.support.domain.SupportStatus;
import com.maxsolch.shop.support.infra.SupportMessageRepository;
import com.maxsolch.shop.support.infra.SupportThreadRepository;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * What a customer may do in support, from «Настройки → Поддержка»: on/off, message length, the pause between
 * messages, messages per hour and open threads. Every check throws {@link DomainException.BadRequest}.
 */
@Component
public class SupportLimits {

    private final SettingsService settings;
    private final SupportThreadRepository threads;
    private final SupportMessageRepository messageRepository;
    private final Messages messages;

    public SupportLimits(SettingsService settings, SupportThreadRepository threads,
                         SupportMessageRepository messageRepository, Messages messages) {
        this.settings = settings;
        this.threads = threads;
        this.messageRepository = messageRepository;
        this.messages = messages;
    }

    public ConfigDto config() {
        return new ConfigDto(
                settings.getBool(SettingsRegistry.SUPPORT_ENABLED),
                settings.getInt(SettingsRegistry.SUPPORT_MAX_LENGTH),
                settings.getInt(SettingsRegistry.SUPPORT_COOLDOWN_SEC),
                settings.getInt(SettingsRegistry.SUPPORT_MAX_OPEN_THREADS),
                settings.getInt(SettingsRegistry.SUPPORT_MAX_MESSAGES_PER_HOUR));
    }

    void requireEnabled() {
        if (!settings.getBool(SettingsRegistry.SUPPORT_ENABLED)) {
            throw new DomainException.BadRequest(messages.current("api.support.disabled"),
                    ErrorCode.of("SUPPORT_DISABLED"));
        }
    }

    /** Text or attachment present, text within {@code support.maxLength}, attachment is the customer's own. */
    void validateContent(long userId, SendMessageRequest req) {
        requireContent(req);
        int max = settings.getInt(SettingsRegistry.SUPPORT_MAX_LENGTH);
        if (max > 0 && req.text() != null && req.text().strip().length() > max) {
            throw new DomainException.BadRequest(messages.current("api.support.tooLong", max),
                    ErrorCode.of("SUPPORT_TOO_LONG"));
        }
        if (req.attachmentUrl() != null && !req.attachmentUrl().isBlank()
                && !ImageStorageService.isCustomerAttachmentKey(req.attachmentUrl(), userId)) {
            throw new DomainException.BadRequest(messages.current("api.chat.badAttachment"));
        }
    }

    void requireContent(SendMessageRequest req) {
        if (req == null || ((req.text() == null || req.text().isBlank())
                && (req.attachmentUrl() == null || req.attachmentUrl().isBlank()))) {
            throw new DomainException.BadRequest(messages.current("api.chat.needsContent"));
        }
    }

    /** {@code support.cooldownSec} between messages and {@code support.maxMessagesPerHour}. */
    void checkRate(long userId, Instant now) {
        int cooldown = settings.getInt(SettingsRegistry.SUPPORT_COOLDOWN_SEC);
        if (cooldown > 0) {
            Instant last = messageRepository.lastSentAt(SenderType.CUSTOMER, userId);
            if (last != null) {
                long wait = cooldown - Duration.between(last, now).getSeconds();
                if (wait > 0) {
                    throw new DomainException.BadRequest(messages.current("api.support.cooldown", wait),
                            ErrorCode.of("SUPPORT_COOLDOWN"));
                }
            }
        }
        int perHour = settings.getInt(SettingsRegistry.SUPPORT_MAX_MESSAGES_PER_HOUR);
        if (perHour > 0) {
            long sent = messageRepository.countSentSince(SenderType.CUSTOMER, userId, now.minus(Duration.ofHours(1)));
            if (sent >= perHour) {
                throw new DomainException.BadRequest(messages.current("api.support.hourlyLimit", perHour),
                        ErrorCode.of("SUPPORT_HOURLY_LIMIT"));
            }
        }
    }

    /** {@code support.maxOpenThreads}: room for one more open thread. */
    void requireThreadSlot(long userId) {
        int max = settings.getInt(SettingsRegistry.SUPPORT_MAX_OPEN_THREADS);
        if (max > 0 && threads.countByUserIdAndStatus(userId, SupportStatus.OPEN) >= max) {
            throw new DomainException.BadRequest(messages.current("api.support.tooManyThreads", max),
                    ErrorCode.of("SUPPORT_TOO_MANY_THREADS"));
        }
    }
}
