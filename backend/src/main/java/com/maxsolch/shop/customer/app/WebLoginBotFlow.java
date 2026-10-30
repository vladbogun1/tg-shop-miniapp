package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.domain.CustomerError;
import com.maxsolch.shop.customer.domain.WebLoginStatus;
import com.maxsolch.shop.customer.domain.WebLoginToken;
import com.maxsolch.shop.customer.domain.WebSession;
import com.maxsolch.shop.customer.infra.WebLoginTokenRepository;
import com.maxsolch.shop.customer.infra.WebSessionRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.WebSessionValidator;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.web.UserAgents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The Telegram-bot half of the website login: the prompt behind {@code /start login_<nonce>}, the number the person
 * presses, and the "end this session" button. The browser half (start, complete, refresh, logout) is
 * {@link WebAuthService}; both work on the same login rows.
 */
@Service
public class WebLoginBotFlow {

    /** What the bot shows after {@code /start login_<nonce>}. */
    public record BotPrompt(String loginId, List<Integer> choices, String deviceLabel) {
    }

    public enum BotDecision { CONFIRMED, REJECTED, EXPIRED, INVALID }

    private final WebLoginTokenRepository tokenRepository;
    private final WebSessionRepository sessionRepository;
    private final WebSessionValidator sessionValidator;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public WebLoginBotFlow(WebLoginTokenRepository tokenRepository, WebSessionRepository sessionRepository,
                           WebSessionValidator sessionValidator, Clock clock) {
        this.tokenRepository = tokenRepository;
        this.sessionRepository = sessionRepository;
        this.sessionValidator = sessionValidator;
        this.clock = clock;
    }

    /**
     * {@code /start login_<nonce>}: the prompt to show, or empty when the link is unknown,
     * expired or already answered. Remembers which chat it was shown in — only that person may
     * answer it.
     */
    @Transactional
    public Optional<BotPrompt> openFromBot(String nonce, long chatId) {
        if (nonce == null || nonce.isBlank() || nonce.length() > 128) {
            return Optional.empty();
        }
        Optional<WebLoginToken> found = tokenRepository.findByNonceHash(WebAuthService.sha256(nonce.trim()));
        if (found.isEmpty()) {
            return Optional.empty();
        }
        WebLoginToken t = found.get();
        if (expireIfDue(tokenRepository, t, now()) != WebLoginStatus.PENDING) {
            return Optional.empty();
        }
        if (t.getBotChatId() != null && t.getBotChatId() != chatId) {
            // Someone else already opened this link: a forwarded link must not be answerable twice.
            return Optional.empty();
        }
        t.setBotChatId(chatId);
        tokenRepository.save(t);
        return Optional.of(new BotPrompt(UuidUtil.toString(t.getId()), choices(t.getMatchCode()),
                UserAgents.describe(t.getUserAgent())));
    }

    @Transactional
    public void attachBotMessage(String loginId, long chatId, int messageId) {
        tokenRepository.findById(idBytes(loginId)).ifPresent(t -> {
            if (t.getBotChatId() != null && t.getBotChatId() == chatId) {
                t.setBotMessageId(messageId);
                tokenRepository.save(t);
            }
        });
    }

    /**
     * A button press in the bot. {@code chosen == null} is "it's not me". The right number confirms,
     * anything else rejects — one attempt, there is no retry.
     */
    @Transactional
    public BotDecision decideFromBot(String loginId, long fromUserId, Integer chosen) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(loginId);
        } catch (IllegalArgumentException e) {
            return BotDecision.INVALID;
        }
        Optional<WebLoginToken> found = tokenRepository.findById(id);
        if (found.isEmpty()) {
            return BotDecision.INVALID;
        }
        WebLoginToken t = found.get();
        // In a private chat the chat id IS the user id: only the person the prompt was sent to.
        if (t.getBotChatId() == null || t.getBotChatId() != fromUserId) {
            return BotDecision.INVALID;
        }
        WebLoginStatus status = expireIfDue(tokenRepository, t, now());
        if (status == WebLoginStatus.EXPIRED) {
            return BotDecision.EXPIRED;
        }
        if (status != WebLoginStatus.PENDING) {
            return BotDecision.INVALID;
        }
        Instant now = now();
        if (chosen != null && chosen == t.getMatchCode()) {
            t.setStatus(WebLoginStatus.CONFIRMED);
            t.setTelegramUserId(fromUserId);
            t.setConfirmedAt(now);
            tokenRepository.save(t);
            return BotDecision.CONFIRMED;
        }
        t.setStatus(WebLoginStatus.REJECTED);
        tokenRepository.save(t);
        return BotDecision.REJECTED;
    }

    /**
     * "End this session" button under the login notification.
     *
     * @return the device label of the ended session, or empty if it is not this user's session
     */
    @Transactional
    public Optional<String> revokeFromBot(String sessionId, long fromUserId) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(sessionId);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        Optional<WebSession> s = sessionRepository.findById(id).filter(x -> x.getUserId() == fromUserId);
        if (s.isEmpty()) {
            return Optional.empty();
        }
        if (s.get().getRevokedAt() == null) {
            s.get().setRevokedAt(now());
            sessionRepository.save(s.get());
        }
        sessionValidator.invalidate(sessionId);
        return Optional.of(UserAgents.describe(s.get().getUserAgent()));
    }

    /** A pending or confirmed request past its time reads (and is stored) as EXPIRED. */
    static WebLoginStatus expireIfDue(WebLoginTokenRepository tokens, WebLoginToken t, Instant now) {
        if ((t.getStatus() == WebLoginStatus.PENDING || t.getStatus() == WebLoginStatus.CONFIRMED)
                && t.isExpired(now)) {
            t.setStatus(WebLoginStatus.EXPIRED);
            tokens.save(t);
        }
        return t.getStatus();
    }

    /** Second precision - what the TIMESTAMP columns store, so responses match the database. */
    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.SECONDS);
    }

    private static byte[] idBytes(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new DomainException.BadRequest(CustomerError.INVALID_ID);
        }
    }

    /** The right number and two distinct decoys from 10-99, shuffled. */
    private List<Integer> choices(int matchCode) {
        Set<Integer> set = new LinkedHashSet<>();
        set.add(matchCode);
        while (set.size() < 3) {
            set.add(10 + random.nextInt(90));
        }
        List<Integer> list = new ArrayList<>(set);
        Collections.shuffle(list, random);
        return list;
    }
}
