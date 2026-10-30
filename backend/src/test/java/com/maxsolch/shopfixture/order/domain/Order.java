package com.maxsolch.shopfixture.order.domain;

/** A guarded entity of the fixture: the public setter is what O3 must find. */
public class Order {
    private long totalMinor;

    public void setTotalMinor(long totalMinor) {
        this.totalMinor = totalMinor;
    }

    public long getTotalMinor() {
        return totalMinor;
    }
}
