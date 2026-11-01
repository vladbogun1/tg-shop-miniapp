package com.maxsolch.shop.support.app;

import static com.maxsolch.shop.platform.util.Texts.ellipsize;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.support.app.SupportDtos.StartThreadRequest;
import com.maxsolch.shop.support.app.SupportDtos.ThreadDto;
import com.maxsolch.shop.support.domain.SupportStatus;
import com.maxsolch.shop.support.domain.SupportThread;
import com.maxsolch.shop.support.infra.SupportThreadRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

/**
 * The admin writes first (a giveaway winner, a question about a returned parcel): a new thread with the admin's
 * message in it, so the customer gets the usual bot DM with a button into the chat and the answer lands in the
 * admin chats. The customer's limits (cooldown, hourly, open-thread slots) do not apply: they are the customer's.
 */
@Service
public class AdminThreadStarter {

    private static final int SUBJECT_MAX = 255;

    private final SupportThreadRepository threads;
    private final SupportPosts posts;
    private final SupportLimits limits;
    private final SupportMapper mapper;
    private final AdminAuditService audit;
    private final CurrentActor actor;
    private final Clock clock;

    public AdminThreadStarter(SupportThreadRepository threads, SupportPosts posts, SupportLimits limits,
                              SupportMapper mapper, AdminAuditService audit, CurrentActor actor, Clock clock) {
        this.threads = threads;
        this.posts = posts;
        this.limits = limits;
        this.mapper = mapper;
        this.audit = audit;
        this.actor = actor;
        this.clock = clock;
    }

    @Transactional
    public ThreadDto start(StartThreadRequest req) {
        long userId = req.userId();
        SendMessageRequest first = new SendMessageRequest(req.text(), null, null, null, null, null);
        limits.requireContent(first);
        String customerName = posts.requireCustomerName(userId);
        Instant now = clock.instant();
        SupportThread t = new SupportThread();
        t.setId(UuidUtil.randomBytes());
        t.setUserId(userId);
        t.setTgUserId(userId > 0 ? userId : null);
        t.setCustomerName(customerName);
        t.setSource(SupportService.SOURCE_MINIAPP);
        t.setStatus(SupportStatus.OPEN);
        t.setCreatedAt(now);
        t.setLastMessageAt(now);
        String subject = req.subject() == null ? "" : req.subject().strip();
        t.setSubject(subject.isEmpty() ? null : ellipsize(subject, SUBJECT_MAX));
        threads.saveAndFlush(t);
        posts.postAdmin(t, actor.userId(), audit.currentAdminName(), first, now);
        audit.record("support.start", "support_thread", UuidUtil.toString(t.getId()), "user " + userId);
        return mapper.toDto(t, true);
    }
}
