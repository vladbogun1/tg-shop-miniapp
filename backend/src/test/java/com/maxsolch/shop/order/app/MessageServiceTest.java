package com.maxsolch.shop.order.app;

import com.maxsolch.shop.media.MediaSigner;
import com.maxsolch.shop.order.app.MessageDto;
import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMessage;
import com.maxsolch.shop.order.infra.OrderMessageRepository;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.i18n.Messages;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The order chat: what a posted message carries and what is sent once it is saved. */
class MessageServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-07T12:34:56.789Z");

    private final OrderMessageRepository messageRepository = mock(OrderMessageRepository.class);
    private final OrderRepository orderRepository = mock(OrderRepository.class);
    private final SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final MediaSigner signer = mock(MediaSigner.class);
    private MessageService service;
    private final byte[] orderId = new byte[16];

    @BeforeEach
    void setUp() {
        Order order = new Order();
        order.setId(orderId);
        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
        when(messageRepository.saveAndFlush(any(OrderMessage.class))).thenAnswer(inv -> inv.getArgument(0));
        service = new MessageService(messageRepository, orderRepository, template, events, signer,
                mock(Messages.class), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void postedMessageIsStampedWithWholeSecondsOfTheClock() {
        MessageDto dto = service.postAdminMessage(orderId, 7L, "Менеджер",
                new SendMessageRequest("привет", "TEXT", null, null, null, null));

        assertThat(dto.createdAt()).isEqualTo(Instant.parse("2026-10-07T12:34:56Z"));
    }

    @Test
    void postedMessageIsPushedToTheOrderTopic() {
        service.postCustomerMessage(orderId, 7L, "Покупатель",
                new SendMessageRequest("привет", "TEXT", null, null, null, null));

        verify(template).convertAndSend(startsWith("/topic/orders/"), any(MessageDto.class));
    }

    @Test
    void markReadUsesTheClock() {
        service.markRead(orderId, com.maxsolch.shop.order.domain.SenderType.CUSTOMER);

        verify(messageRepository).markRead(eq(orderId), eq(com.maxsolch.shop.order.domain.SenderType.CUSTOMER), eq(NOW));
    }
}
