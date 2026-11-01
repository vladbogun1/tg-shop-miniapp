package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.notification.app.AdminPushService;
import com.maxsolch.shop.staff.domain.AdminRole;
import com.maxsolch.shop.staff.domain.AdminUser;
import com.maxsolch.shop.staff.infra.AdminUserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** What the admin team screen reads from other modules' tables, on a real MySQL (audit package 5). */
class AdminTeamDbBoundsIT extends AbstractMysqlIT {

    private static final long ADMIN = 9_500_000_000_001L;
    private static final long CLEAN = 9_500_000_000_002L;

    @Autowired
    AdminHistory history;
    @Autowired
    AdminTeamView view;
    @Autowired
    AdminPushService push;
    @Autowired
    AdminUserRepository admins;

    @Test
    void historyListsEveryTraceOfTheAdminButOwnSignInEntries() {
        jdbc.update("DELETE FROM admin_audit_log WHERE admin_id IN (?, ?)", ADMIN, CLEAN);
        jdbc.update("DELETE FROM broadcasts WHERE admin_id IN (?, ?)", ADMIN, CLEAN);
        jdbc.update("DELETE FROM inbox_marks WHERE created_by IN (?, ?)", ADMIN, CLEAN);
        jdbc.update("INSERT INTO admin_audit_log (admin_id, action, entity_type) VALUES (?, 'ORDER_STATUS', 'ORDER')", ADMIN);
        jdbc.update("INSERT INTO admin_audit_log (admin_id, action, entity_type) VALUES (?, 'ORDER_PAID', 'ORDER')", ADMIN);
        jdbc.update("INSERT INTO admin_audit_log (admin_id, action, entity_type) VALUES (?, 'ADMIN_LOGIN', 'ADMIN')", ADMIN);
        jdbc.update("INSERT INTO broadcasts (admin_id, text, audience, status) VALUES (?, 't', 'all', 'DONE')", ADMIN);
        jdbc.update("INSERT INTO inbox_marks (item_type, entity_id, item_version, mark, created_by) "
                + "VALUES ('IT', 'e1', 'v', 'DISMISSED', ?)", ADMIN);

        List<String> reasons = history.of(ADMIN);

        assertThat(reasons).containsExactlyInAnyOrder("записей в журнале: 2", "рассылок: 1", "отметок в «Внимание»: 1");
        assertThat(history.of(CLEAN)).isEmpty();
    }

    @Test
    void telegramLabelsComeFromShopUsers() {
        jdbc.update("DELETE FROM users WHERE telegram_user_id = ?", ADMIN);
        jdbc.update("INSERT INTO users (telegram_user_id, username, first_name, last_name, created_at, last_seen_at, "
                + "is_premium, bot_blocked) VALUES (?, 'boss', 'Ivan', 'Petrov', now(), now(), false, false)", ADMIN);

        jdbc.update("DELETE FROM admin_users WHERE telegram_user_id = ?", ADMIN);
        admins.save(AdminUser.enroll(ADMIN, "Boss", AdminRole.ADMIN));

        var row = view.team(CLEAN).admins().stream().filter(a -> a.telegramUserId() == ADMIN).findFirst().orElseThrow();

        assertThat(row.telegramLabel()).isEqualTo("@boss · Ivan Petrov");
    }

    @Test
    void pushSubscriptionsOfTheAdminAreDropped() {
        jdbc.update("DELETE FROM admin_push_subscriptions WHERE admin_id IN (?, ?)", ADMIN, CLEAN);
        for (long id : new long[]{ADMIN, ADMIN, CLEAN}) {
            String endpoint = "https://push.example/" + java.util.UUID.randomUUID();
            jdbc.update("INSERT INTO admin_push_subscriptions (admin_id, endpoint, endpoint_hash, p256dh, auth) "
                    + "VALUES (?, ?, sha2(?, 256), 'k', 'a')", id, endpoint, endpoint);
        }

        assertThat(push.forgetAdmin(ADMIN)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM admin_push_subscriptions WHERE admin_id = ?", Integer.class, CLEAN))
                .isEqualTo(1);
    }
}
