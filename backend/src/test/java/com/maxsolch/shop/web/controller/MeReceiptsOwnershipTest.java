package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.payment.ReceiptService;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.web.ForbiddenException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.ReceiptDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Receipts carry the customer's name, amount and card — only the order's owner gets the links. */
@ExtendWith(MockitoExtension.class)
class MeReceiptsOwnershipTest {

    @Mock
    OrderRepository orders;
    @Mock
    Messages messages;
    @Mock
    ReceiptService receipts;

    MeController controller;
    Order order;

    @BeforeEach
    void setUp() {
        controller = new MeController(null, null, orders, null, null, null, null, null, null, null, messages, null);
        ReflectionTestUtils.setField(controller, "receipts", receipts);
        lenient().when(messages.current(anyString())).thenAnswer(inv -> inv.getArgument(0));
        order = new Order();
        order.setId(UuidUtil.randomBytes());
        order.setUserId(100L);
        lenient().when(orders.findById(any())).thenReturn(Optional.of(order));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static void loginAs(long telegramUserId) {
        AuthPrincipal p = new AuthPrincipal(telegramUserId, Role.CUSTOMER);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(p, null, List.of()));
    }

    @Test
    void owner_getsTheList() {
        loginAs(100L);
        ReceiptDto dto = new ReceiptDto("bank:x", "BANK", "READY", null, null, null, 1L, "/api/receipts/file?x");
        when(receipts.forOrder(order.getId())).thenReturn(List.of(dto));

        assertThat(controller.receipts(UuidUtil.toString(order.getId()))).containsExactly(dto);
    }

    @Test
    void someoneElse_forbidden_andNothingIsSigned() {
        loginAs(200L);

        assertThatThrownBy(() -> controller.receipts(UuidUtil.toString(order.getId())))
                .isInstanceOf(ForbiddenException.class);
        verify(receipts, never()).forOrder(any());
    }

    @Test
    void orderWithoutOwner_forbidden() {
        loginAs(100L);
        order.setUserId(null);

        assertThatThrownBy(() -> controller.receipts(UuidUtil.toString(order.getId())))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void garbageId_notFound() {
        loginAs(100L);

        assertThatThrownBy(() -> controller.receipts("not-a-uuid")).isInstanceOf(NotFoundException.class);
    }
}
