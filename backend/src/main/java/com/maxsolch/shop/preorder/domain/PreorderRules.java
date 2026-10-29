package com.maxsolch.shop.preorder.domain;

import java.util.ArrayList;
import java.util.List;

/** Pure pre-order rules: who gets what on arrival, and how an ETA reads. No I/O — unit-tested directly. */
public final class PreorderRules {

    private PreorderRules() {
    }

    /** One queued person as the hand-out sees them. */
    public record Seat(long id, PreorderSubscription.Status status, int qty, int heldQty) {
    }

    /** Units kept for one person. */
    public record Grant(long subscriptionId, int qty) {
    }

    /** Somebody still waiting after the hand-out, and their place in the line (1 = next). */
    public record Short(long subscriptionId, int position) {
    }

    public record Allocation(List<Grant> grants, List<Short> shorts, int freeLeft) {

        public int grantedQty() {
            return grants.stream().mapToInt(Grant::qty).sum();
        }
    }

    /**
     * Hands {@code free} units to the WAITING people of a queue in order (the list is already sorted by
     * joining time). Each gets what they asked for or what is left — a partial hold beats making the first
     * person wait while the second one, who asked for less, buys. HELD and NOTIFIED seats are skipped:
     * they were served by an earlier hand-out.
     */
    public static Allocation allocate(List<Seat> queue, int free) {
        List<Grant> grants = new ArrayList<>();
        List<Short> shorts = new ArrayList<>();
        int left = Math.max(0, free);
        for (Seat s : queue) {
            if (s.status() != PreorderSubscription.Status.WAITING) {
                continue;
            }
            int give = Math.min(Math.max(1, s.qty()), left);
            if (give > 0) {
                grants.add(new Grant(s.id(), give));
                left -= give;
            } else {
                shorts.add(new Short(s.id(), shorts.size() + 1));
            }
        }
        return new Allocation(grants, shorts, left);
    }

    /** Units of a line nobody holds: what a stranger could buy. */
    public static int free(int stock, List<Seat> queue) {
        int held = queue.stream()
                .filter(s -> s.status() == PreorderSubscription.Status.HELD)
                .mapToInt(Seat::heldQty).sum();
        return Math.max(0, stock - held);
    }
}
