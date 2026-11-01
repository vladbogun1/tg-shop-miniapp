package com.maxsolch.shop.platform.config;

import com.maxsolch.shop.platform.security.AdminTokenValidator;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import com.maxsolch.shop.platform.security.JwtService;
import com.maxsolch.shop.platform.security.Role;
import com.maxsolch.shop.platform.security.WebSessionValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;

import java.time.Clock;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** SUBSCRIBE is deny-by-default: the simple broker treats wildcard destinations as patterns. */
class WebSocketConfigTest {

    private static final long OWNER = 7L;
    private static final long STRANGER = 8L;
    private static final String ORDER = "11111111-2222-3333-4444-555555555555";

    private WebSocketConfig config;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        StompTopicOwner orders = new StompTopicOwner() {
            public String topicPrefix() { return "/topic/orders/"; }
            public boolean isOwner(String key, long userId) { return ORDER.equals(key) && userId == OWNER; }
        };
        ObjectProvider<StompTopicOwner> owners = mock(ObjectProvider.class);
        when(owners.orderedStream()).thenAnswer(i -> Stream.of(orders));
        AdminTokenValidator admin = mock(AdminTokenValidator.class);
        when(admin.isValid(any())).thenReturn(true);
        config = new WebSocketConfig(mock(JwtService.class), admin, mock(AllowedOrigins.class),
                mock(WebSessionValidator.class), owners, Clock.systemUTC());
    }

    private StompHeaderAccessor subscribe(String destination, AuthPrincipal principal) {
        StompHeaderAccessor a = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        a.setDestination(destination);
        a.setUser(new WebSocketConfig.StompPrincipal(principal));
        return a;
    }

    private AuthPrincipal customer(long id) {
        return new AuthPrincipal(id, Role.CUSTOMER);
    }

    @Test
    void ownerMaySubscribeToOwnOrderChat() {
        assertThatCode(() -> config.authorizeSubscription(subscribe("/topic/orders/" + ORDER + "/chat", customer(OWNER))))
                .doesNotThrowAnyException();
    }

    @Test
    void strangerIsRefused() {
        assertThatThrownBy(() -> config.authorizeSubscription(subscribe("/topic/orders/" + ORDER + "/chat", customer(STRANGER))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void adminMaySubscribeToConcreteTopic() {
        assertThatCode(() -> config.authorizeSubscription(
                subscribe("/topic/orders/" + ORDER + "/chat", new AuthPrincipal(1L, Role.ADMIN))))
                .doesNotThrowAnyException();
    }

    @Test
    void wildcardsAndUnknownDestinationsAreRefusedForEveryone() {
        for (AuthPrincipal who : new AuthPrincipal[] {customer(OWNER), new AuthPrincipal(1L, Role.ADMIN)}) {
            for (String dest : new String[] {"/topic/**", "/topic/*", "/topic/orders/*/chat", "/topic/orders/**",
                    "/topic/orders/" + ORDER + "/**", "/topic/orders//chat", "/topic/orders/../x", "/topic/orders/{id}/chat",
                    "/topic/x", "/queue/x", "/topic/orders/" + ORDER + "/chat/extra"}) {
                assertThatThrownBy(() -> config.authorizeSubscription(subscribe(dest, who)))
                        .as(dest).isInstanceOf(IllegalArgumentException.class);
            }
        }
    }

    @Test
    void clientSendToTopicIsRefused() {
        StompHeaderAccessor send = StompHeaderAccessor.create(StompCommand.SEND);
        send.setDestination("/topic/orders/" + ORDER + "/chat");
        assertThatThrownBy(() -> config.rejectClientSend(send)).isInstanceOf(IllegalArgumentException.class);
    }
}
