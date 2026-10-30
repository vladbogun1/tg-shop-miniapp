package com.maxsolch.shop.platform;

import com.maxsolch.shop.delivery.api.AdminSystemController;
import com.maxsolch.shop.notification.api.BroadcastDeliveryController;
import com.maxsolch.shop.journal.api.ActivityLogController;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.settings.api.AdminSettingsController;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

import java.lang.reflect.Method;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Two admin routes moved out of {@code platform} into the module that owns the data. The URLs (the admin app calls
 * them) and the admin-only guard must be what they were.
 */
class MovedAdminRoutesTest {

    private static Set<String> routes(Class<?>... controllers) {
        Set<String> out = new TreeSet<>();
        for (Class<?> c : controllers) {
            String prefix = c.getAnnotation(RequestMapping.class).value()[0];
            for (Method m : c.getDeclaredMethods()) {
                RequestMapping rm = AnnotatedElementUtils.findMergedAnnotation(m, RequestMapping.class);
                if (rm != null) {
                    out.add(rm.method()[0] + " " + prefix + (rm.path().length == 0 ? "" : rm.path()[0]));
                }
            }
        }
        return out;
    }

    @Test
    void settingsAndSystemKeepTheirUrls() {
        assertThat(routes(AdminSettingsController.class, AdminSystemController.class)).containsExactlyInAnyOrder(
                "GET /api/admin/settings", "PUT /api/admin/settings", "GET /api/admin/settings/system");
    }

    @Test
    void broadcastTabKeepsItsUrl() {
        assertThat(routes(BroadcastDeliveryController.class)).containsExactly("GET /api/admin/activity/broadcasts");
        assertThat(routes(ActivityLogController.class)).doesNotContain("GET /api/admin/activity/broadcasts");
    }

    @Test
    void movedControllersAreAdminOnly() {
        assertThat(AdminSystemController.class.isAnnotationPresent(RequiredAdmin.class)).isTrue();
        assertThat(BroadcastDeliveryController.class.isAnnotationPresent(RequiredAdmin.class)).isTrue();
    }
}
