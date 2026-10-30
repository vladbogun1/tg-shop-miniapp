package com.maxsolch.shop.staff.api;

import com.maxsolch.shop.customer.api.AuthController;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/** The sign-in URLs under /api/auth were one controller and are now two (customer, admin): same URLs. */
class AuthRoutesTest {

    @Test
    void everyOldUrlIsStillServed_andNothingIsAdded() {
        Set<String> now = new TreeSet<>();
        for (Class<?> c : new Class<?>[]{AuthController.class, AdminAuthController.class}) {
            String prefix = c.getAnnotation(RequestMapping.class).value()[0];
            for (Method m : c.getDeclaredMethods()) {
                RequestMapping rm = AnnotatedElementUtils.findMergedAnnotation(m, RequestMapping.class);
                if (rm != null) {
                    now.add(rm.method()[0] + " " + prefix + rm.path()[0]);
                }
            }
        }
        assertThat(now).containsExactlyInAnyOrder(
                "POST /api/auth/telegram", "POST /api/auth/admin/telegram", "POST /api/auth/admin/login",
                "POST /api/auth/admin/2fa/verify", "POST /api/auth/admin/2fa/setup", "POST /api/auth/admin/2fa/confirm");
    }
}
