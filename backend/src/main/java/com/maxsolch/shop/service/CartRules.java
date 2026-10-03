package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.web.dto.CartDtos.CartLineInput;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Pure rules of the server-side cart — no database, so they are unit-tested on their own.
 *
 * <p>Ids are canonical lower-case UUID strings: comparing {@code byte[]} keys by reference is the
 * classic way to get duplicate lines.
 */
public final class CartRules {

    /** Distinct product+variant lines per customer. */
    public static final int MAX_LINES = 100;
    /** Units per line (the shop sells single items; 99 is "a lot" without being a typo of 9999). */
    public static final int MAX_QUANTITY = 99;
    /** Raw lines accepted in one request before normalisation (duplicates included). */
    public static final int MAX_REQUEST_LINES = 500;

    private CartRules() {
    }

    /** Product + variant; {@code variantId} null for a product without variants. */
    public record LineKey(String productId, String variantId) {

        public static LineKey of(byte[] productId, byte[] variantId) {
            return new LineKey(UuidUtil.toString(productId), variantId == null ? null : UuidUtil.toString(variantId));
        }
    }

    public record Line(LineKey key, int quantity) {
    }

    /**
     * Client lines → clean lines: unparsable ids and non-positive quantities are dropped (a stale
     * client cache must not fail a whole sync), duplicates of one key are summed, every quantity is
     * clamped to {@link #MAX_QUANTITY}. Order of first appearance is kept.
     */
    public static List<Line> normalize(List<CartLineInput> input) {
        Map<LineKey, Integer> acc = new LinkedHashMap<>();
        if (input == null) {
            return List.of();
        }
        for (CartLineInput in : input) {
            if (in == null || in.quantity() <= 0) {
                continue;
            }
            String productId = canonical(in.productId());
            if (productId == null) {
                continue;
            }
            String variantId = null;
            if (in.variantId() != null && !in.variantId().isBlank()) {
                variantId = canonical(in.variantId());
                if (variantId == null) {
                    continue;
                }
            }
            acc.merge(new LineKey(productId, variantId), in.quantity(), (a, b) -> clampQty((long) a + b));
        }
        List<Line> out = new ArrayList<>(acc.size());
        acc.forEach((k, q) -> out.add(new Line(k, clampQty(q))));
        return out;
    }

    /**
     * Guest cart into the account's cart (sign-in on the site, first run of the Mini App).
     *
     * <p>The same line in both → the LARGER quantity, not the sum: the two carts are usually the
     * same intention seen from two devices (or the same browser signing in again), and summing
     * would double it every time; max is also idempotent, so a retried merge changes nothing.
     * Account lines keep their order, new guest lines go after them; lines beyond
     * {@link #MAX_LINES} are dropped from the guest side — a sign-in must never fail on the cart.
     */
    public static List<Line> merge(List<Line> server, List<Line> guest) {
        Map<LineKey, Integer> acc = new LinkedHashMap<>();
        for (Line l : server) {
            acc.merge(l.key(), l.quantity(), Math::max);
        }
        for (Line l : guest) {
            if (acc.containsKey(l.key())) {
                acc.merge(l.key(), l.quantity(), Math::max);
            } else if (acc.size() < MAX_LINES) {
                acc.put(l.key(), l.quantity());
            }
        }
        List<Line> out = new ArrayList<>(acc.size());
        acc.forEach((k, q) -> out.add(new Line(k, clampQty(q))));
        return out;
    }

    static int clampQty(long q) {
        return (int) Math.max(1, Math.min(MAX_QUANTITY, q));
    }

    private static String canonical(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(raw.trim()).toString().toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
