package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.PromoReservation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface PromoReservationRepository extends JpaRepository<PromoReservation, byte[]> {

    @Query("""
            select r from PromoReservation r
            where r.promoCodeId = :promoCodeId and r.telegramUserId = :userId
            """)
    Optional<PromoReservation> find(@Param("promoCodeId") byte[] promoCodeId,
                                    @Param("userId") long userId);

    /**
     * Live holds by OTHER customers. Expired rows are excluded by the query rather than trusted to
     * have been swept already, so a stuck scheduler can never block a code.
     */
    @Query("""
            select count(r) from PromoReservation r
            where r.promoCodeId = :promoCodeId
              and r.telegramUserId <> :userId
              and r.expiresAt > :now
            """)
    long countOthers(@Param("promoCodeId") byte[] promoCodeId,
                     @Param("userId") long userId,
                     @Param("now") Instant now);

    /** {@code [promoCodeId, live holds]} — the «резерв N» column of the admin promo list (Р11). */
    @Query("select r.promoCodeId, count(r) from PromoReservation r where r.expiresAt > :now group by r.promoCodeId")
    java.util.List<Object[]> liveCounts(@Param("now") Instant now);

    @Modifying
    @Query("delete from PromoReservation r where r.expiresAt <= :now")
    int deleteExpired(@Param("now") Instant now);

    @Modifying
    @Query("delete from PromoReservation r where r.promoCodeId = :promoCodeId and r.telegramUserId = :userId")
    int release(@Param("promoCodeId") byte[] promoCodeId, @Param("userId") long userId);
}
