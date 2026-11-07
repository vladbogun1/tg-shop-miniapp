package com.maxsolch.shop.promo.infra;

import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.domain.PromoOrigin;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.Instant;

/** Filters of the admin's paged list; the origin rule mirrors {@link PromoOrigin#of(String, Long)}. */
public final class PromoSpecs {

    private PromoSpecs() {
    }

    /** null origin = no filter. */
    public static Specification<PromoCode> origin(PromoOrigin origin) {
        return (root, q, cb) -> {
            if (origin == null) {
                return cb.conjunction();
            }
            var source = root.<String>get("source");
            var owner = root.get("ownerUserId");
            return switch (origin) {
                case REVIEW -> cb.equal(source, PromoCode.SOURCE_REVIEW_BONUS);
                case CASE -> cb.equal(source, PromoCode.SOURCE_GIFT_CASE);
                case OURS -> cb.and(cb.isNull(source), cb.isNull(owner));
                case PERSONAL -> cb.and(
                        cb.or(cb.isNull(source), cb.not(source.in(PromoCode.SOURCE_REVIEW_BONUS, PromoCode.SOURCE_GIFT_CASE))),
                        cb.or(cb.isNotNull(owner), cb.isNotNull(source)));
            };
        };
    }

    /** Code contains the text, or the owner's Telegram id equals it; blank = no filter. */
    public static Specification<PromoCode> search(String text) {
        return (root, q, cb) -> {
            String t = text == null ? "" : text.trim();
            if (t.isEmpty()) {
                return cb.conjunction();
            }
            String like = "%" + t.toLowerCase(java.util.Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%")
                    .replace("_", "\\_") + "%";
            Predicate byCode = cb.like(cb.lower(root.get("code")), like, '\\');
            try {
                return cb.or(byCode, cb.equal(root.get("ownerUserId"), Long.parseLong(t)));
            } catch (NumberFormatException e) {
                return byCode;
            }
        };
    }

    /** {@code live}: a customer can use it now; {@code off}: the opposite; anything else = no filter. */
    public static Specification<PromoCode> state(String state, Instant now) {
        return (root, q, cb) -> {
            Predicate live = cb.and(
                    cb.isTrue(root.get("active")),
                    cb.or(cb.isNull(root.get("expiresAt")), cb.greaterThan(root.<Instant>get("expiresAt"), now)),
                    cb.or(cb.isNull(root.get("maxUses")),
                            cb.lessThan(root.<Integer>get("usesCount"), root.<Integer>get("maxUses"))));
            if ("live".equals(state)) {
                return live;
            }
            return "off".equals(state) ? cb.not(live) : cb.conjunction();
        };
    }
}
