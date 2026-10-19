package com.maxsolch.shop.gift;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GiftCaseTierRepository extends JpaRepository<GiftCaseTier, GiftCaseTier.Tier> {
}
