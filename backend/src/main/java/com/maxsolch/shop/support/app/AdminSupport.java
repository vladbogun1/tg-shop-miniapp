package com.maxsolch.shop.support.app;

import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.support.app.SupportDtos.MessageDto;
import com.maxsolch.shop.support.app.SupportDtos.StartThreadRequest;
import com.maxsolch.shop.support.app.SupportDtos.ThreadDto;
import org.springframework.stereotype.Service;

/** The admin answering a support thread: who answers (id and display name) comes from the current actor. */
@Service
public class AdminSupport {

    private final SupportService support;
    private final AdminAuditService audit;
    private final CurrentActor actor;
    private final AdminThreadStarter starter;

    public AdminSupport(SupportService support, AdminAuditService audit, CurrentActor actor, AdminThreadStarter starter) {
        this.starter = starter;
        this.support = support;
        this.audit = audit;
        this.actor = actor;
    }

    public MessageDto send(String threadId, SendMessageRequest req) {
        return support.sendAsAdmin(threadId, actor.userId(), audit.currentAdminName(), req);
    }

    /** Write to a customer first: a new thread with this message. */
    public ThreadDto start(StartThreadRequest req) {
        return starter.start(req);
    }
}
