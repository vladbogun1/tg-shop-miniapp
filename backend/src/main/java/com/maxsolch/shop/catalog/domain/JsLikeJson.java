package com.maxsolch.shop.catalog.domain;

import java.util.Collection;
import java.util.Map;

/**
 * JSON в том же виде, что {@code JSON.stringify(value, null, 2)} в JavaScript: отступ 2 пробела, «"key": value»,
 * пустые {@code {}} и {@code []} одной строкой, не-ASCII без экранирования. Нужен, чтобы блок «Товары» промпта совпадал
 * с админским символ в символ. Поддержаны Map, Collection, String, Number, Boolean, null.
 */
public final class JsLikeJson {

    private JsLikeJson() {
    }

    public static String stringify(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, value, 0);
        return sb.toString();
    }

    private static void write(StringBuilder sb, Object v, int depth) {
        if (v == null) {
            sb.append("null");
        } else if (v instanceof String s) {
            quote(sb, s);
        } else if (v instanceof Map<?, ?> m) {
            writeMap(sb, m, depth);
        } else if (v instanceof Collection<?> c) {
            writeList(sb, c, depth);
        } else {
            sb.append(v);
        }
    }

    private static void writeMap(StringBuilder sb, Map<?, ?> m, int depth) {
        if (m.isEmpty()) {
            sb.append("{}");
            return;
        }
        sb.append("{");
        boolean first = true;
        for (Map.Entry<?, ?> e : m.entrySet()) {
            sb.append(first ? "\n" : ",\n");
            first = false;
            indent(sb, depth + 1);
            quote(sb, String.valueOf(e.getKey()));
            sb.append(": ");
            write(sb, e.getValue(), depth + 1);
        }
        sb.append("\n");
        indent(sb, depth);
        sb.append("}");
    }

    private static void writeList(StringBuilder sb, Collection<?> c, int depth) {
        if (c.isEmpty()) {
            sb.append("[]");
            return;
        }
        sb.append("[");
        boolean first = true;
        for (Object o : c) {
            sb.append(first ? "\n" : ",\n");
            first = false;
            indent(sb, depth + 1);
            write(sb, o, depth + 1);
        }
        sb.append("\n");
        indent(sb, depth);
        sb.append("]");
    }

    private static void indent(StringBuilder sb, int depth) {
        sb.append("  ".repeat(depth));
    }

    private static void quote(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                default -> {
                    if (ch < 0x20) {
                        sb.append(String.format("\\u%04x", (int) ch));
                    } else {
                        sb.append(ch);
                    }
                }
            }
        }
        sb.append('"');
    }
}
