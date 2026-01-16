package com.example.tgshop.promo;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PromoCodeRepository extends JpaRepository<PromoCode, byte[]> {
  Optional<PromoCode> findByCodeIgnoreCase(String code);
  boolean existsByCodeIgnoreCase(String code);
}
