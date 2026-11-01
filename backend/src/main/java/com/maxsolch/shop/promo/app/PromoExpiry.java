package com.maxsolch.shop.promo.app;

import com.maxsolch.shop.promo.infra.PromoExpiryStore;
import com.maxsolch.shop.promo.domain.ExpiringPromo;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

/**
 * Promo codes that are about to run out, for the modules that remind their customers about a code they issued
 * (review bonus, gift case). The codes stay in promo's table: the other module only asks and claims.
 */
@Service
public class PromoExpiry {

    /** Pages read before giving up: owners the caller skips must not hide the ones behind them, but the scan is bounded. */
    static final int MAX_PAGES = 20;

    private final PromoExpiryStore store;

    public PromoExpiry(PromoExpiryStore store) {
        this.store = store;
    }

    /**
     * Up to {@code limit} codes of {@code source} expiring in {@code (now, expiresBy]} (issued no later than
     * {@code issuedBefore}, not reminded yet) that {@code wanted} accepts, soonest first. The caller decides who is
     * worth a reminder (a customer who blocked the bot is not): codes it skips are read past, not counted.
     */
    public List<ExpiringPromo> expiring(String source, Instant now, Instant expiresBy, Instant issuedBefore, int limit,
                                   Predicate<ExpiringPromo> wanted) {
        List<ExpiringPromo> out = new ArrayList<>();
        for (int page = 0; page < MAX_PAGES && out.size() < limit; page++) {
            List<ExpiringPromo> batch = store.page(source, now, expiresBy, issuedBefore, limit, page * limit);
            for (ExpiringPromo e : batch) {
                if (out.size() < limit && wanted.test(e)) {
                    out.add(e);
                }
            }
            if (batch.size() < limit) {
                break;
            }
        }
        return out;
    }

    /** Takes the reminder of a code: true exactly once per code (a second instance, a retry get false). */
    public boolean claimReminder(byte[] promoId, Instant now) {
        return store.claim(promoId, now);
    }

    /** Gives the reminder back after a send that failed: the next run tries again. */
    public void releaseReminder(byte[] promoId, Instant claimedAt) {
        store.release(promoId, claimedAt);
    }
}
