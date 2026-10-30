package com.maxsolch.shop.support.app;

import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.support.app.SupportDtos.CreateThreadRequest;
import com.maxsolch.shop.support.app.SupportDtos.MessageDto;
import com.maxsolch.shop.support.app.SupportDtos.ThreadDto;
import org.springframework.stereotype.Service;

/**
 * What the customer does in support: asks a question or writes into a thread. Adds what is not support's own
 * business: where the customer came from (Mini App or site) and the «Журнал → Бот и сайт» line (not the text).
 */
@Service
public class CustomerSupport {

    private final SupportService support;
    private final CurrentActor actor;
    private final ActivityLog activity;

    public CustomerSupport(SupportService support, CurrentActor actor, ActivityLog activity) {
        this.support = support;
        this.actor = actor;
        this.activity = activity;
    }

    public ThreadDto ask(CreateThreadRequest req) {
        String source = actor.principal().isWeb() ? SupportService.SOURCE_WEB : SupportService.SOURCE_MINIAPP;
        ThreadDto thread = support.create(actor.userId(), source, req);
        activity.record(ActivityLog.fromRequest("SUPPORT_REQUEST")
                .text(thread.productTitle() != null && !thread.productTitle().isBlank()
                        ? "Вопрос в поддержку о товаре «" + thread.productTitle() + "»"
                        : "Вопрос в поддержку")
                .detail("thread", thread.id()));
        return thread;
    }

    public MessageDto write(String threadId, SendMessageRequest req) {
        MessageDto sent = support.sendAsCustomer(actor.userId(), threadId, req);
        activity.record(ActivityLog.fromRequest("SUPPORT_MESSAGE")
                .text("Сообщение в поддержку").detail("thread", threadId));
        return sent;
    }
}
