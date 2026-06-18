package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.PromoCode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PromoCodeRepository extends JpaRepository<PromoCode, byte[]> {

    Optional<PromoCode> findByCodeAndActiveTrue(String code);

    Optional<PromoCode> findByCode(String code);

    List<PromoCode> findAllByOrderByCreatedAtDesc();
}
