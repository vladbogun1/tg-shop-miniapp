package com.maxsolch.shop.review.app;

import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.app.PromoCodes;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.review.app.ReviewDtos.Bonus;
import com.maxsolch.shop.review.domain.ProductReview;
import com.maxsolch.shop.review.domain.ReviewEvents;
import com.maxsolch.shop.review.domain.ReviewRules;
import com.maxsolch.shop.review.infra.ReviewStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/** The personal promo code for the first published review of an order, and the customer's list of such codes. */
@Slf4j
@Component
public class ReviewBonus {

    private final ReviewStore store;
    private final SettingsService settings;
    private final PromoCodes promoCodes;
    private final DomainEvents events;
    private final Clock clock;

    public ReviewBonus(ReviewStore store, SettingsService settings, PromoCodes promoCodes, DomainEvents events,
                       Clock clock) {
        this.store = store;
        this.settings = settings;
        this.promoCodes = promoCodes;
        this.events = events;
        this.clock = clock;
    }

    /**
     * Issues the review bonus of the review's order — once per order (an atomic flag on the order),
     * personal (owner = the author), single use, valid {@code reviews.bonusValidDays}. The DM goes out after the commit.
     *
     * @return the bonus issued now, or null
     */
    public Bonus issueIfFirst(ProductReview review) {
        int percent = settings.get(ReviewSettings.REVIEWS_BONUS_PERCENT, 5);
        if (!ReviewRules.bonusEnabled(percent) || review.getOrderId() == null) {
            return null;
        }
        Instant now = clock.instant();
        if (!store.claimBonus(review.getOrderId(), now)) {
            return null;
        }
        PromoCode promo = new PromoCode();
        promo.setCode(uniqueCode());
        promo.setDiscountPercent(Math.min(100, percent));
        promo.setDiscountAmountMinor(0);
        promo.setMaxDiscountMinor(ReviewRules.bonusMaxMinor(settings.get(ReviewSettings.REVIEWS_BONUS_MAX_UAH, 100)));
        promo.setMaxUses(1);
        promo.setUsesCount(0);
        promo.setActive(true);
        promo.setOwnerUserId(review.getUserId());
        promo.setExpiresAt(ReviewRules.bonusExpiry(now, settings.get(ReviewSettings.REVIEWS_BONUS_VALID_DAYS, 60)));
        promo.setSource(PromoCode.SOURCE_REVIEW_BONUS);
        promo.setSourceOrderId(review.getOrderId());
        PromoCode saved = promoCodes.save(promo);
        Long chat = review.getTgUserId() != null ? review.getTgUserId() : review.getUserId();
        String code = saved.getCode();
        int pc = saved.getDiscountPercent();
        long max = saved.getMaxDiscountMinor();
        Instant expires = saved.getExpiresAt();
        events.publish(new ReviewEvents.BonusIssued(chat, code, pc, max, expires));
        log.info("Review bonus {} issued to {} for order {}", code, review.getUserId(),
                UuidUtil.toString(review.getOrderId()));
        return new Bonus(code, pc, expires, "ACTIVE", UuidUtil.toString(review.getOrderId()), now,
                PromoCode.SOURCE_REVIEW_BONUS, 0, max);
    }

    private String uniqueCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            String code = ReviewRules.bonusCode();
            if (promoCodes.find(code).isEmpty()) {
                return code;
            }
        }
        throw new IllegalStateException("could not generate a unique bonus code");
    }

    /** My personal promo codes (review bonuses), newest first. */
    @Transactional(readOnly = true)
    public List<Bonus> bonuses(long userId) {
        Instant now = clock.instant();
        return promoCodes.ownedBy(userId).stream().map(p -> toBonus(p, now)).toList();
    }

    static Bonus toBonus(PromoCode p, Instant now) {
        String state;
        if (p.getMaxUses() != null && p.getUsesCount() >= p.getMaxUses()) {
            state = "USED";
        } else if (!p.isActive() || p.isExpiredAt(now)) {
            state = "EXPIRED";
        } else {
            state = "ACTIVE";
        }
        return new Bonus(p.getCode(), p.getDiscountPercent(), p.getExpiresAt(), state,
                p.getSourceOrderId() == null ? null : UuidUtil.toString(p.getSourceOrderId()),
                p.getCreatedAt(), p.getSource(), p.getDiscountAmountMinor(), p.getMaxDiscountMinor());
    }
}
