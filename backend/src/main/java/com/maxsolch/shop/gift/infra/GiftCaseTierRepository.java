package com.maxsolch.shop.gift.infra;

import com.maxsolch.shop.gift.domain.GiftCaseTier;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GiftCaseTierRepository extends JpaRepository<GiftCaseTier, GiftCaseTier.Tier> {
}
