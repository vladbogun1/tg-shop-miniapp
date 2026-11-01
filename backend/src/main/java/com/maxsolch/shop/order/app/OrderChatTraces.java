package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.order.infra.OrderMessageRepository;
import com.maxsolch.shop.staff.domain.AdminTraces;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Implements staff's {@link AdminTraces}: the admin's messages in order chats. */
@Service
public class OrderChatTraces implements AdminTraces {

    private final OrderMessageRepository messages;

    public OrderChatTraces(OrderMessageRepository messages) {
        this.messages = messages;
    }

    @Override
    public String label() {
        return "сообщений в чатах заказов";
    }

    @Override
    @Transactional(readOnly = true)
    public long countBy(long adminId) {
        return messages.countBySenderTypeAndSenderId(SenderType.ADMIN, adminId);
    }
}
