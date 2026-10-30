package com.maxsolch.shop.settings.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.PlatformError;
import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingType;

/** Validation of an admin-entered value and the text/JSON forms of a setting. No state, no I/O. */
final class SettingNormalizer {

    private static final int AUDIT_VALUE_CHARS = 40;

    private SettingNormalizer() {
    }

    /**
     * Validates {@code raw} against the definition and returns its canonical text form.
     *
     * @throws DomainException.BadRequest with a Russian message naming the setting
     */
    static String normalize(SettingDefinition def, Object raw) {
        String label = "«" + def.label() + "»";
        return switch (def.type()) {
            case INT -> normalizeInt(def, raw, label);
            case BOOL -> normalizeBool(raw, label);
            case STRING, TEXT -> normalizeText(def, raw, label);
            case SELECT -> normalizeSelect(def, raw, label);
        };
    }

    private static String normalizeInt(SettingDefinition def, Object raw, String label) {
        long v;
        if (raw instanceof Number n) {
            double d = n.doubleValue();
            if (d != Math.rint(d) || Double.isInfinite(d)) {
                throw invalid(PlatformError.SETTING_NOT_INTEGER, label);
            }
            v = n.longValue();
        } else if (raw instanceof String s) {
            try {
                v = Long.parseLong(s.trim());
            } catch (NumberFormatException e) {
                throw invalid(PlatformError.SETTING_NOT_INTEGER, label);
            }
        } else {
            throw invalid(PlatformError.SETTING_NOT_INTEGER, label);
        }
        if ((def.min() != null && v < def.min()) || (def.max() != null && v > def.max())) {
            throw invalid(PlatformError.SETTING_OUT_OF_RANGE, label, String.valueOf(def.min()), String.valueOf(def.max()));
        }
        return String.valueOf(v);
    }

    private static String normalizeBool(Object raw, String label) {
        if (raw instanceof Boolean b) {
            return b.toString();
        }
        if (raw instanceof String s && ("true".equalsIgnoreCase(s.trim()) || "false".equalsIgnoreCase(s.trim()))) {
            return s.trim().toLowerCase();
        }
        throw invalid(PlatformError.SETTING_NOT_BOOLEAN, label);
    }

    private static String normalizeText(SettingDefinition def, Object raw, String label) {
        if (!(raw instanceof String s)) {
            throw invalid(PlatformError.SETTING_TEXT_REQUIRED, label);
        }
        String v = s.replace("\r\n", "\n").replace('\r', '\n').strip();
        if (def.type() == SettingType.STRING && v.indexOf('\n') >= 0) {
            throw invalid(PlatformError.SETTING_SINGLE_LINE, label);
        }
        if (def.maxLength() != null && v.length() > def.maxLength()) {
            throw invalid(PlatformError.SETTING_TOO_LONG, label, String.valueOf(def.maxLength()));
        }
        return def.check() == null ? v : def.check().apply(label, v);
    }

    private static String normalizeSelect(SettingDefinition def, Object raw, String label) {
        String v = raw instanceof String s ? s.strip() : null;
        if (v != null) {
            for (SettingDefinition.Option o : def.options()) {
                if (o.value().equalsIgnoreCase(v)) {
                    return o.value();
                }
            }
        }
        throw invalid(PlatformError.SETTING_NOT_IN_LIST, label);
    }

    private static DomainException.BadRequest invalid(PlatformError reason, Object... args) {
        return new DomainException.BadRequest(reason, args);
    }

    /** Canonical text → JSON-friendly value; an unparsable stored value shows as the default. */
    static Object typed(SettingDefinition d, String value) {
        try {
            return switch (d.type()) {
                case INT -> Long.parseLong(value.trim());
                case BOOL -> Boolean.parseBoolean(value.trim());
                case STRING, TEXT, SELECT -> value == null ? "" : value;
            };
        } catch (RuntimeException e) {
            // Defaults are always valid, so this cannot recurse more than once.
            return d.defaultValue().equals(value) ? null : typed(d, d.defaultValue());
        }
    }

    /** «Журнал» is read by the owner: the label of «Настройки», not the technical key. */
    static String auditName(SettingDefinition d) {
        return d.label() == null || d.label().isBlank() ? d.key() : "«" + d.label() + "»";
    }

    /** A value as the owner reads it in the journal. */
    static String show(SettingDefinition d, String value) {
        if (value == null) {
            return "—";
        }
        if (d.type() == SettingType.BOOL) {
            return Boolean.parseBoolean(value.trim()) ? "вкл" : "выкл";
        }
        if (d.type() == SettingType.SELECT && d.options() != null) {
            return d.options().stream().filter(o -> o.value().equals(value)).findFirst()
                    .map(o -> "«" + o.label() + "»").orElse(value);
        }
        if (d.type() == SettingType.STRING || d.type() == SettingType.TEXT) {
            if (value.isEmpty()) {
                return "(пусто)";
            }
            String flat = value.replace('\n', ' ');
            return "«" + (flat.length() <= AUDIT_VALUE_CHARS ? flat : flat.substring(0, AUDIT_VALUE_CHARS - 1) + "…") + "»";
        }
        return value;
    }
}
