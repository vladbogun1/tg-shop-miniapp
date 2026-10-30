package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.platform.util.UuidUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/** What a push about an order needs to know, read fresh after the commit (amount, source, the customer's name). */
@Slf4j
@Component
public class PushOrderQueries {

    private final JdbcTemplate jdbc;

    public PushOrderQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Amount + where the order came from. */
    public record OrderInfo(String id, String shortId, long totalMinor, String currency, String source) {
    }

    Optional<OrderInfo> order(byte[] orderId) {
        List<OrderInfo> rows = jdbc.query(
                "select total_minor, currency, source from orders where id = ?",
                (rs, i) -> {
                    String uuid = UuidUtil.toString(orderId);
                    return new OrderInfo(uuid, uuid.substring(0, 8), rs.getLong("total_minor"),
                            rs.getString("currency"), rs.getString("source"));
                },
                (Object) orderId);
        return rows.stream().findFirst();
    }

    String customerName(byte[] orderId) {
        try {
            List<String> names = jdbc.queryForList("select customer_name from orders where id = ?", String.class, (Object) orderId);
            return names.isEmpty() ? null : names.get(0);
        } catch (RuntimeException e) {
            log.debug("Customer name for push failed: {}", e.toString());
            return null;
        }
    }
}
