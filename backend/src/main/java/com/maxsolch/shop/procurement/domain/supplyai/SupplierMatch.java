package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.List;

/**
 * Supplier named by the AI to our supplier: exact name first, else one name inside the other when the shorter is
 * at least 4 characters. Same logic as frontend-admin/features/supply/model/ai/supplier.ts.
 */
public final class SupplierMatch {

    /** Shorter is too generic ("A", "Shop"): matched only exactly. */
    private static final int MIN_CONTAINS = 4;

    public record Named(String id, String name) {
    }

    private SupplierMatch() {
    }

    /** Supplier id, or null when nothing fits. */
    public static String byName(String name, List<Named> list) {
        if (list == null || name == null) {
            return null;
        }
        String n = SupplyText.norm(name);
        if (n.isEmpty()) {
            return null;
        }
        for (Named s : list) {
            if (SupplyText.norm(s.name()).equals(n)) {
                return s.id();
            }
        }
        for (Named s : list) {
            String m = SupplyText.norm(s.name());
            String shorter = m.length() < n.length() ? m : n;
            if (shorter.length() >= MIN_CONTAINS && (m.contains(n) || n.contains(m))) {
                return s.id();
            }
        }
        return null;
    }
}
