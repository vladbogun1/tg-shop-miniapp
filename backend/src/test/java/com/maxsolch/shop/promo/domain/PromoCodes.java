package com.maxsolch.shop.promo.domain;

import java.time.Instant;

/**
 * Test builder of a {@link PromoCode} in any state a test needs. Lives in the entity's package, so it may use the
 * package-private setters that production code (outside the package) may not.
 */
public final class PromoCodes {

    private final PromoCode p;

    private PromoCodes() {
        this(new PromoCode());
    }

    private PromoCodes(PromoCode p) {
        this.p = p;
    }

    public static PromoCodes promo() {
        return new PromoCodes();
    }

    public PromoCodes id(byte[] v) {
        p.setId(v);
        return this;
    }

    public PromoCodes code(String v) {
        p.setCode(v);
        return this;
    }

    public PromoCodes discountPercent(int v) {
        p.setDiscountPercent(v);
        return this;
    }

    public PromoCodes discountAmountMinor(long v) {
        p.setDiscountAmountMinor(v);
        return this;
    }

    public PromoCodes maxDiscountMinor(long v) {
        p.setMaxDiscountMinor(v);
        return this;
    }

    public PromoCodes maxUses(Integer v) {
        p.setMaxUses(v);
        return this;
    }

    public PromoCodes usesCount(int v) {
        p.setUsesCount(v);
        return this;
    }

    public PromoCodes active(boolean v) {
        p.setActive(v);
        return this;
    }

    public PromoCodes ownerUserId(Long v) {
        p.setOwnerUserId(v);
        return this;
    }

    public PromoCodes expiresAt(Instant v) {
        p.setExpiresAt(v);
        return this;
    }

    public PromoCodes source(String v) {
        p.setSource(v);
        return this;
    }

    public PromoCodes sourceOrderId(byte[] v) {
        p.setSourceOrderId(v);
        return this;
    }

    /** Changes an existing code (the fields tests flip mid-scenario). */
    public static PromoCode with(PromoCode c, java.util.function.Consumer<PromoCodes> change) {
        PromoCodes b = new PromoCodes(c);
        change.accept(b);
        return c;
    }

    public PromoCode build() {
        return p;
    }
}
