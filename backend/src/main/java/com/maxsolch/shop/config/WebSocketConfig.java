package com.maxsolch.shop.config;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.security.AdminTokenValidator;
import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.security.WebCookies;
import com.maxsolch.shop.security.WebSessionValidator;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.security.Principal;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * STOMP over WebSocket. Endpoint /ws (+SockJS), broker /topic. JWT auth in a ChannelInterceptor:
 * CONNECT reads the token from the STOMP {@code Authorization} header and sets a Principal;
 * SUBSCRIBE to /topic/orders/{id}/chat is authorized to the order owner (CUSTOMER) or any ADMIN.
 *
 * <p>The token is deliberately read from the CONNECT frame only, never from a {@code ?token=}
 * query parameter: URLs end up in proxy access logs, browser history and Referer headers, and a
 * leaked 30-day admin JWT there is a full compromise. STOMP frame headers work over SockJS too,
 * so nothing is lost.
 */
@Slf4j
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtService jwtService;
    private final OrderRepository orderRepository;
    private final AdminTokenValidator adminTokenValidator;
    private final AllowedOrigins allowedOrigins;
    private final WebSessionValidator webSessionValidator;

    /** Session attribute holding the handshake's {@code access} cookie (site auth). */
    static final String ACCESS_COOKIE_ATTR = "site.accessJwt";

    public WebSocketConfig(JwtService jwtService,
                           OrderRepository orderRepository,
                           AdminTokenValidator adminTokenValidator,
                           AllowedOrigins allowedOrigins,
                           WebSessionValidator webSessionValidator) {
        this.jwtService = jwtService;
        this.orderRepository = orderRepository;
        this.adminTokenValidator = adminTokenValidator;
        this.allowedOrigins = allowedOrigins;
        this.webSessionValidator = webSessionValidator;
    }

    /** Copies the {@code access} cookie of the HTTP handshake into the WebSocket session attributes. */
    static final class AccessCookieHandshakeInterceptor implements HandshakeInterceptor {
        @Override
        public boolean beforeHandshake(@NonNull ServerHttpRequest request, @NonNull ServerHttpResponse response,
                                       @NonNull WebSocketHandler wsHandler, @NonNull Map<String, Object> attributes) {
            if (request instanceof ServletServerHttpRequest servlet) {
                String jwt = WebCookies.read(servlet.getServletRequest(), WebCookies.ACCESS);
                if (jwt != null) {
                    attributes.put(ACCESS_COOKIE_ATTR, jwt);
                }
            }
            return true;
        }

        @Override
        public void afterHandshake(@NonNull ServerHttpRequest request, @NonNull ServerHttpResponse response,
                                   @NonNull WebSocketHandler wsHandler, Exception exception) {
            // nothing
        }
    }

    @Override
    public void registerStompEndpoints(@NonNull StompEndpointRegistry registry) {
        // Same origin list as CORS (AllowedOrigins) — the handshake used to accept "*".
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(allowedOrigins.patternsArray())
                .addInterceptors(new AccessCookieHandshakeInterceptor())
                .withSockJS();
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(allowedOrigins.patternsArray())
                .addInterceptors(new AccessCookieHandshakeInterceptor());
    }

    @Override
    public void configureMessageBroker(@NonNull MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    /**
     * Open admin sessions → their token's principal. The token is only presented on CONNECT, so
     * without this a tab kept receiving every chat for up to an hour (the gateway's WS timeout)
     * after the admin was deactivated, logged out or logged out everywhere.
     */
    private final Map<String, AuthPrincipal> adminSessions = new ConcurrentHashMap<>();

    /** Sockets that drop without a STOMP DISCONNECT end here too. */
    @org.springframework.context.event.EventListener
    public void onSessionDisconnect(org.springframework.web.socket.messaging.SessionDisconnectEvent event) {
        adminSessions.remove(event.getSessionId());
    }

    /**
     * Re-checks an admin session against revocation (token_version, jti, active flag — cached for
     * 30 s in {@link AdminTokenValidator}) and against the token's own expiry.
     */
    private boolean adminSessionStillValid(AuthPrincipal principal) {
        if (principal.expiresAt() != null && Instant.now().isAfter(principal.expiresAt())) {
            return false;
        }
        return adminTokenValidator.isValid(principal);
    }

    /**
     * Every message the broker pushes to an admin session re-checks the token; once it is revoked
     * or expired the message is replaced by an ERROR frame, after which Spring closes the WebSocket.
     * The panel then reconnects with whatever token it has now — or ends up on the login screen.
     */
    @Override
    public void configureClientOutboundChannel(@NonNull ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
                if (SimpMessageHeaderAccessor.getMessageType(message.getHeaders()) != SimpMessageType.MESSAGE) {
                    return message;
                }
                String sessionId = SimpMessageHeaderAccessor.getSessionId(message.getHeaders());
                AuthPrincipal principal = sessionId == null ? null : adminSessions.get(sessionId);
                if (principal == null || adminSessionStillValid(principal)) {
                    return message;
                }
                adminSessions.remove(sessionId);
                log.debug("Closing WS session {}: admin token revoked or expired", sessionId);
                StompHeaderAccessor error = StompHeaderAccessor.create(StompCommand.ERROR);
                error.setMessage("token revoked");
                error.setSessionId(sessionId);
                return MessageBuilder.createMessage(new byte[0], error.getMessageHeaders());
            }
        });
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
                    if (principal.role() == Role.ADMIN && accessor.getSessionId() != null) {
                        adminSessions.put(accessor.getSessionId(), principal);
                    }
                } else if (StompCommand.SUBSCRIBE.equals(command)) {
                    authorizeSubscription(accessor);
                } else if (StompCommand.DISCONNECT.equals(command) && accessor.getSessionId() != null) {
                    adminSessions.remove(accessor.getSessionId());
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
            // The public site has no token in JS (HttpOnly cookie): use the `access` cookie that
            // came with the handshake. Cross-site handshakes are already refused by the origin
            // check on the endpoint, so this cannot be driven from a foreign page.
            Map<String, Object> attrs = accessor.getSessionAttributes();
            Object fromCookie = attrs == null ? null : attrs.get(ACCESS_COOKIE_ATTR);
            token = fromCookie instanceof String s ? s : null;
        }
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            AuthPrincipal principal = jwtService.parse(token);
            if (!adminTokenValidator.isValid(principal)) {
                log.debug("WS auth rejected: revoked admin token");
                return null;
            }
            if (!webSessionValidator.isValid(principal)) {
                log.debug("WS auth rejected: site session ended");
                return null;
            }
            return principal;
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
            // The token was checked on CONNECT only; a revoked one must not open new chats.
            if (!adminSessionStillValid(principal)) {
                throw new IllegalArgumentException("unauthorized: admin token revoked");
            }
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
