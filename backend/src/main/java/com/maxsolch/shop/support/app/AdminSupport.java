package com.maxsolch.shop.support.app;

import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.support.app.SupportDtos.MessageDto;
import org.springframework.stereotype.Service;

/** The admin answering a support thread: who answers (id and display name) comes from the current actor. */
@Service
public class AdminSupport {

    private final SupportService support;
    private final AdminAuditService audit;
    private final CurrentActor actor;

    public AdminSupport(SupportService support, AdminAuditService audit, CurrentActor actor) {
        this.support = support;
        this.audit = audit;
        this.actor = actor;
    }

    public MessageDto send(String threadId, SendMessageRequest req) {
        return support.sendAsAdmin(threadId, actor.userId(), audit.currentAdminName(), req);
    }
}
