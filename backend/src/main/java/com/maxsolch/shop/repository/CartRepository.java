package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.Cart;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface CartRepository extends JpaRepository<Cart, Long> {

    /**
     * Creates the header row if it is not there yet. {@code INSERT IGNORE} rather than
     * find-then-save: the first write from two devices at once would otherwise both see "no cart"
     * and the second insert would fail on the primary key.
     */
    @Modifying
    @Query(value = "INSERT IGNORE INTO carts (user_id, version, updated_at) VALUES (:userId, 0, CURRENT_TIMESTAMP(3))",
            nativeQuery = true)
    int ensureExists(@Param("userId") long userId);

    /** The header row with a write lock: serialises every cart write of one customer. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Cart c where c.userId = :userId")
    Optional<Cart> findForUpdate(@Param("userId") long userId);
}
