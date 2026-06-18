package com.maxsolch.shop.config;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.Role;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.security.Principal;
import java.util.List;
import java.util.Optional;

/**
 * STOMP over WebSocket. Endpoint /ws (+SockJS), broker /topic. JWT auth in a ChannelInterceptor:
 * CONNECT reads the token from the Authorization header or ?token= query and sets a Principal;
 * SUBSCRIBE to /topic/orders/{id}/chat is authorized to the order owner (CUSTOMER) or any ADMIN.
 */
@Slf4j
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtService jwtService;
    private final OrderRepository orderRepository;

    public WebSocketConfig(JwtService jwtService, OrderRepository orderRepository) {
        this.jwtService = jwtService;
        this.orderRepository = orderRepository;
    }

    @Override
    public void registerStompEndpoints(@NonNull StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .withSockJS();
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*");
    }

    @Override
    public void configureMessageBroker(@NonNull MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void configureClientInboundChannel(@NonNull ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
                StompHeaderAccessor accessor =
                        MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor == null) {
                    return message;
                }
                StompCommand command = accessor.getCommand();
                if (StompCommand.CONNECT.equals(command)) {
                    AuthPrincipal principal = authenticate(accessor);
                    if (principal == null) {
                        throw new IllegalArgumentException("unauthorized: missing/invalid token");
                    }
                    accessor.setUser(new StompPrincipal(principal));
                } else if (StompCommand.SUBSCRIBE.equals(command)) {
                    authorizeSubscription(accessor);
                }
                return message;
            }
        });
    }

    private AuthPrincipal authenticate(StompHeaderAccessor accessor) {
        String token = firstHeader(accessor, "Authorization");
        if (token != null && token.startsWith("Bearer ")) {
            token = token.substring("Bearer ".length()).trim();
        }
        if (token == null || token.isBlank()) {
            token = firstHeader(accessor, "token");
        }
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            return jwtService.parse(token);
        } catch (Exception e) {
            log.debug("WS auth rejected: {}", e.getMessage());
            return null;
        }
    }

    private void authorizeSubscription(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith("/topic/orders/")) {
            return;
        }
        Principal user = accessor.getUser();
        if (!(user instanceof StompPrincipal sp)) {
            throw new IllegalArgumentException("unauthorized subscription");
        }
        AuthPrincipal principal = sp.principal();
        // /topic/orders/{orderId}/chat
        String rest = destination.substring("/topic/orders/".length());
        int slash = rest.indexOf('/');
        String orderId = slash >= 0 ? rest.substring(0, slash) : rest;

        if (principal.role() == Role.ADMIN) {
            return;
        }
        byte[] id;
        try {
            id = UuidUtil.toBytes(orderId);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("invalid order id");
        }
        Optional<Order> order = orderRepository.findById(id);
        if (order.isEmpty() || order.get().getUserId() == null
                || order.get().getUserId() != principal.telegramUserId()) {
            throw new IllegalArgumentException("forbidden: not your order");
        }
    }

    private String firstHeader(StompHeaderAccessor accessor, String name) {
        List<String> values = accessor.getNativeHeader(name);
        if (values != null && !values.isEmpty()) {
            return values.get(0);
        }
        return null;
    }

    /** Carries the JWT principal as the STOMP session user. */
    public record StompPrincipal(AuthPrincipal principal) implements Principal {
        @Override
        public String getName() {
            return String.valueOf(principal.telegramUserId());
        }
    }
}
