package com.maxsolch.shop.gift.infra;

import com.maxsolch.shop.gift.domain.OrderGiftCase;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderGiftCaseRepository extends JpaRepository<OrderGiftCase, byte[]> {
}
