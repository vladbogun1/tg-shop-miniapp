package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.PromoCode;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PromoCodeRepository extends JpaRepository<PromoCode, byte[]> {

    Optional<PromoCode> findByCodeAndActiveTrue(String code);

    /**
     * Locks the promo row so the {@code usesCount < maxUses} check and the increment cannot
     * interleave with another checkout — otherwise a "last use" code is consumable N times at once.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PromoCode p where p.code = :code and p.active = true")
    Optional<PromoCode> findByCodeAndActiveTrueForUpdate(@Param("code") String code);

    Optional<PromoCode> findByCode(String code);

    List<PromoCode> findAllByOrderByCreatedAtDesc();
}
