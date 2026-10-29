package com.maxsolch.shop.preorder;

import com.maxsolch.shop.preorder.PreorderDtos.SubscriberDto;

import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * The waiting list as a CSV for Excel: UTF-8 with a BOM, {@code ;} as the separator (Ukrainian locale),
 * Kyiv time. Names come from Telegram, so a cell that starts like a formula gets a leading apostrophe.
 */
public final class PreorderCsv {

    public static final String HEADER = "name;username;qty;status;source;createdAt;botBlocked";
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private PreorderCsv() {
    }

    public static String build(List<SubscriberDto> rows) {
        StringBuilder sb = new StringBuilder("\uFEFF").append(HEADER).append("\r\n");
        for (SubscriberDto s : rows) {
            sb.append(cell(s.name())).append(';')
                    .append(cell(s.username())).append(';')
                    .append(s.qty()).append(';')
                    .append(cell(s.status())).append(';')
                    .append(cell(s.source())).append(';')
                    .append(s.createdAt() == null ? "" : s.createdAt().atZone(PreorderQueueService.KYIV).format(TIME)).append(';')
                    .append(s.botBlocked() ? "true" : "false")
                    .append("\r\n");
        }
        return sb.toString();
    }

    static String cell(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        String v = value;
        char c = v.charAt(0);
        if (c == '=' || c == '+' || c == '-' || c == '@' || c == '\t' || c == '\r') {
            v = "'" + v;
        }
        if (v.indexOf(';') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) {
            v = "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }
}
