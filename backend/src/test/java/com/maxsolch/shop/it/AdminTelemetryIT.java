package com.maxsolch.shop.it;

import com.maxsolch.shop.platform.security.JwtService;
import com.maxsolch.shop.platform.security.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * /api/admin/telemetry through the real security chain and the real {@code admin_client_events} table (V99): no token —
 * 401, a customer — 403, any admin writes (with the id of the token, not of the body, meta stored as JSON), only the
 * main admin reads.
 */
@AutoConfigureMockMvc
class AdminTelemetryIT extends AbstractMysqlIT {

    private static final String BODY = "{\"adminId\":1,\"events\":[{\"kind\":\"blocked_tap\",\"path\":\"/orders\",\"build\":\"b1\","
            + "\"ua\":\"iPhone\",\"standalone\":true,\"meta\":{\"reason\":\"transparent\",\"trail\":[\"-1s route /orders\"]}},"
            + "{\"kind\":\"nope\"}]}";

    @Autowired
    MockMvc mvc;
    @Autowired
    JwtService jwt;

    private String adminToken(long id, String role) {
        jdbc.update("DELETE FROM admin_users WHERE telegram_user_id = ?", id);
        jdbc.update("INSERT INTO admin_users (telegram_user_id, name, role, active, finance, token_version) VALUES (?, ?, ?, 1, 0, 0)",
                id, "IT admin " + id, role);
        return jwt.issueToken(id, Role.ADMIN, 0);
    }

    private int status(MockHttpServletRequestBuilder rb, String bearer) throws Exception {
        rb.header("Accept-Language", "ru").with(r -> {
            r.setRemoteAddr("10.9." + ThreadLocalRandom.current().nextInt(250) + "." + (1 + ThreadLocalRandom.current().nextInt(250)));
            return r;
        });
        if (bearer != null) {
            rb.header("Authorization", "Bearer " + bearer);
        }
        return mvc.perform(rb).andReturn().getResponse().getStatus();
    }

    private static MockHttpServletRequestBuilder submit() {
        return post("/api/admin/telemetry").contentType(MediaType.APPLICATION_JSON).content(BODY);
    }

    @Test
    void writeNeedsAnAdmin_idFromTheToken_readOnlyForTheMainAdmin() throws Exception {
        long plainId = 9_100_000_000_101L;
        long mainId = 9_100_000_000_102L;
        jdbc.update("DELETE FROM admin_client_events WHERE admin_id IN (?, ?, 1)", plainId, mainId);
        String plain = adminToken(plainId, "ADMIN");
        String main = adminToken(mainId, "SUPER_ADMIN");

        assertThat(status(submit(), null)).isEqualTo(401);
        assertThat(status(submit(), jwt.issueToken(9_100_000_000_103L, Role.CUSTOMER))).isEqualTo(403);
        assertThat(status(submit(), plain)).isEqualTo(204);

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT admin_id, kind, standalone, JSON_UNQUOTE(JSON_EXTRACT(meta, '$.reason')) AS reason "
                        + "FROM admin_client_events WHERE admin_id IN (?, 1)", plainId);
        assertThat(rows).hasSize(1);
        assertThat(((Number) rows.get(0).get("admin_id")).longValue()).isEqualTo(plainId);
        assertThat(rows.get(0).get("kind")).isEqualTo("blocked_tap");
        assertThat(rows.get(0).get("reason")).isEqualTo("transparent");

        assertThat(status(get("/api/admin/telemetry").param("adminId", String.valueOf(plainId)), plain)).isEqualTo(403);
        assertThat(status(get("/api/admin/telemetry").param("adminId", String.valueOf(plainId)), main)).isEqualTo(200);
        String json = mvc.perform(get("/api/admin/telemetry").param("adminId", String.valueOf(plainId))
                        .header("Authorization", "Bearer " + main))
                .andReturn().getResponse().getContentAsString();
        // meta comes back as a JSON object (MySQL re-formats it: "key": "value")
        assertThat(json).contains("\"meta\":{").contains("\"reason\": \"transparent\"").contains("\"kind\":\"blocked_tap\"");
    }
}
