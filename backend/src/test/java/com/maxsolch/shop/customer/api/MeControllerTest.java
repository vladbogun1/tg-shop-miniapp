package com.maxsolch.shop.customer.api;

import com.maxsolch.shop.customer.app.AdminCheck;
import com.maxsolch.shop.customer.app.CustomerProfileService;
import com.maxsolch.shop.customer.app.MeProfileDto;
import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.customer.infra.UserRepository;
import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import com.maxsolch.shop.platform.security.Role;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The customer's language switch and the profile. Wiring is in {@link #controller()} only. */
@ExtendWith(MockitoExtension.class)
class MeControllerTest {

    @Mock
    UserRepository users;
    @Mock
    AdminCheck admins;
    @Mock
    ActivityLog activity;

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.lenient().when(activity.fromRequest(org.mockito.ArgumentMatchers.anyString()))
                .thenAnswer(i -> ActivityLog.Entry.of(ActivityLog.MINIAPP, i.getArgument(0)));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(100L, Role.CUSTOMER), null, List.of()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    MeController controller() {
        return new MeController(new CustomerProfileService(users, admins),
                new com.maxsolch.shop.customer.app.CustomerLocaleChoice(new CustomerProfileService(users, admins), activity),
                new CurrentActor());
    }

    @Test
    void setLocale_unsupported_isIgnored() {
        var response = controller().setLocale("xx");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verifyNoInteractions(users, activity);
    }

    @Test
    void setLocale_changed_isSaved_andJournaled() {
        User user = new User();
        user.setLocale("ru");
        when(users.findById(100L)).thenReturn(Optional.of(user));

        var response = controller().setLocale("UK-ua");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(user.getLocale()).isEqualTo("uk");
        verify(users).save(user);
        verify(activity, times(1)).record(any(ActivityLog.Entry.class));
    }

    @Test
    void setLocale_same_isStillSaved_butNotJournaled() {
        User user = new User();
        user.setLocale("en");
        when(users.findById(100L)).thenReturn(Optional.of(user));

        controller().setLocale("en");

        verify(users).save(user);
        verifyNoInteractions(activity);
    }

    @Test
    void setLocale_unknownUser_doesNothing() {
        when(users.findById(100L)).thenReturn(Optional.empty());

        assertThat(controller().setLocale("en").getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(users, never()).save(any());
        verifyNoInteractions(activity);
    }

    @Test
    void me_knownUser_withAdminFlag() {
        User user = new User();
        user.setTelegramUserId(100L);
        user.setUsername("nick");
        user.setFirstName("A");
        user.setLastName("B");
        when(users.findById(100L)).thenReturn(Optional.of(user));
        when(admins.isActive(100L)).thenReturn(true);

        assertThat(controller().me()).isEqualTo(new MeProfileDto(100L, "nick", "A", "B", true));
    }

    @Test
    void me_unknownUser_fallsBackToBareProfile() {
        when(users.findById(100L)).thenReturn(Optional.empty());

        assertThat(controller().me()).isEqualTo(new MeProfileDto(100L, null, null, null, false));
    }
}
