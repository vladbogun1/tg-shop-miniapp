package com.maxsolch.shopfixture.order.domain;

/** A guarded entity of the fixture: the public setter is what O3 must find. */
public class Order {
    private long totalMinor;

    public void setTotalMinor(long totalMinor) {
        this.totalMinor = totalMinor;
    }

    /** A mutator that is not a setter: O2 must find a call from another module. */
    public void markPaid() {
        this.totalMinor = 0;
    }

    public long getTotalMinor() {
        return totalMinor;
    }
}
