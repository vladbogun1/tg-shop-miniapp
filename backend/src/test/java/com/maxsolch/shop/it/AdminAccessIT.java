package com.maxsolch.shop.it;

import com.maxsolch.shop.platform.security.JwtService;
import com.maxsolch.shop.platform.security.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Who may open the money screens («Финансы»: purchase prices, batch expenses, margin). Pins the rights as they were
 * before the checks moved from the use cases into the {@code @RequiresFinance} annotation (step 9e): an admin without
 * the right gets 403 with the finance text, the main admin and an admin with «Финансы» pass (the status they get is the
 * one of the endpoint itself: 200, or 404/400 for an id that does not exist), a customer token is the generic 403.
 */
@AutoConfigureMockMvc
class AdminAccessIT extends AbstractMysqlIT {

    private static final String FINANCE_TEXT = "Закупка и маржа — только главному админу и тем, у кого есть «Финансы»";

    /** method path body -> status that an admin who may see money gets (the endpoint's own answer). */
    private static final Map<String, Integer> FINANCE_ENDPOINTS = new LinkedHashMap<>();

    static {
        FINANCE_ENDPOINTS.put("GET /api/admin/costing/batches/999999999", 404);
        FINANCE_ENDPOINTS.put("PUT /api/admin/costing/batches/999999999 {}", 404);
        FINANCE_ENDPOINTS.put("POST /api/admin/costing/batches/999999999/expenses {}", 404);
        FINANCE_ENDPOINTS.put("PUT /api/admin/costing/expenses/999999999 {}", 404);
        FINANCE_ENDPOINTS.put("DELETE /api/admin/costing/expenses/999999999", 404);
        FINANCE_ENDPOINTS.put("DELETE /api/admin/costing/expense-files/999999999", 404);
        FINANCE_ENDPOINTS.put("GET /api/admin/costing/expense-files/999999999", 404);
        FINANCE_ENDPOINTS.put("GET /api/admin/costing/products/00000000-0000-0000-0000-000000000000", 404);
        FINANCE_ENDPOINTS.put("GET /api/admin/costing/opening", 200);
        FINANCE_ENDPOINTS.put("PUT /api/admin/costing/opening {}", 400);
        FINANCE_ENDPOINTS.put("POST /api/admin/costing/reconcile", 200);
        FINANCE_ENDPOINTS.put("GET /api/admin/costing/batches/999999999/sales", 404);
        FINANCE_ENDPOINTS.put("GET /api/admin/costing/orders/00000000-0000-0000-0000-000000000000", 404);
        FINANCE_ENDPOINTS.put("GET /api/admin/costing/report", 200);
        FINANCE_ENDPOINTS.put("GET /api/admin/costing/nbu-rate?currency=UAH", 200);
    }

    @Autowired
    MockMvc mvc;
    @Autowired
    JwtService jwt;

    private String adminToken(long id, String role, boolean finance) {
        jdbc.update("DELETE FROM admin_users WHERE telegram_user_id = ?", id);
        jdbc.update("INSERT INTO admin_users (telegram_user_id, name, role, active, finance, token_version) VALUES (?, ?, ?, 1, ?, 0)",
                id, "IT admin " + id, role, finance);
        return jwt.issueToken(id, Role.ADMIN, 0);
    }

    private MockHttpServletResponse call(String spec, String bearer) throws Exception {
        String[] p = spec.split(" ", 3);
        MockHttpServletRequestBuilder rb = switch (p[0]) {
            case "GET" -> MockMvcRequestBuilders.get(p[1]);
            case "PUT" -> MockMvcRequestBuilders.put(p[1]);
            case "POST" -> MockMvcRequestBuilders.post(p[1]);
            default -> MockMvcRequestBuilders.delete(p[1]);
        };
        rb.header("Accept-Language", "ru").header("Authorization", "Bearer " + bearer);
        rb.with(r -> {
            r.setRemoteAddr("10." + ThreadLocalRandom.current().nextInt(250) + "." + ThreadLocalRandom.current().nextInt(250)
                    + "." + (1 + ThreadLocalRandom.current().nextInt(250)));
            return r;
        });
        if (p.length > 2) {
            rb.contentType(MediaType.APPLICATION_JSON).content(p[2]);
        }
        MockHttpServletResponse res = mvc.perform(rb).andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        return res;
    }

    @Test
    void adminWithoutFinanceIsRefusedWithTheFinanceText() throws Exception {
        String token = adminToken(9_100_000_000_001L, "ADMIN", false);
        List<String> wrong = new ArrayList<>();
        for (String spec : FINANCE_ENDPOINTS.keySet()) {
            MockHttpServletResponse r = call(spec, token);
            if (r.getStatus() != 403 || !r.getContentAsString().contains(FINANCE_TEXT)) {
                wrong.add(spec + " -> " + r.getStatus() + " " + r.getContentAsString());
            }
        }
        assertThat(wrong).isEmpty();
    }

    @Test
    void adminWithFinanceAndTheMainAdminReachTheEndpoints() throws Exception {
        for (String token : List.of(adminToken(9_100_000_000_002L, "ADMIN", true),
                adminToken(9_100_000_000_003L, "SUPER_ADMIN", false))) {
            List<String> wrong = new ArrayList<>();
            for (Map.Entry<String, Integer> e : FINANCE_ENDPOINTS.entrySet()) {
                int status = call(e.getKey(), token).getStatus();
                if (status != e.getValue()) {
                    wrong.add(e.getKey() + " -> " + status + " (expected " + e.getValue() + ")");
                }
            }
            assertThat(wrong).isEmpty();
        }
    }

    @Test
    void customerTokenGetsTheGenericRefusal() throws Exception {
        String token = jwt.issueToken(9_100_000_000_004L, Role.CUSTOMER);
        for (String spec : FINANCE_ENDPOINTS.keySet()) {
            MockHttpServletResponse r = call(spec, token);
            assertThat(r.getStatus()).as(spec).isEqualTo(403);
            assertThat(r.getContentAsString()).as(spec).doesNotContain(FINANCE_TEXT);
        }
    }

    @Test
    void accessProbeIsOpenToEveryAdmin() throws Exception {
        String plain = adminToken(9_100_000_000_005L, "ADMIN", false);
        MockHttpServletResponse r = call("GET /api/admin/costing/access", plain);
        assertThat(r.getStatus()).isEqualTo(200);
        assertThat(r.getContentAsString()).contains("\"finance\":false");
    }
}
