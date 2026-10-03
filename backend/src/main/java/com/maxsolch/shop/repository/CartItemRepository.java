package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CartItemRepository extends JpaRepository<CartItem, Long> {

    /** Lines in the order they were first added (stable across devices). */
    @Query("select i from CartItem i where i.userId = :userId order by i.addedAt asc, i.id asc")
    List<CartItem> findByUser(@Param("userId") long userId);
}
