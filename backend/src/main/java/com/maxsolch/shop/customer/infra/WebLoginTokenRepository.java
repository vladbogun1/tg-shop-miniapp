package com.maxsolch.shop.customer.infra;

import com.maxsolch.shop.customer.domain.WebLoginToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface WebLoginTokenRepository extends JpaRepository<WebLoginToken, byte[]> {

    Optional<WebLoginToken> findByNonceHash(String nonceHash);

    @Modifying
    @Query("delete from WebLoginToken t where t.expiresAt < :before")
    int deleteExpiredBefore(@Param("before") Instant before);
}
