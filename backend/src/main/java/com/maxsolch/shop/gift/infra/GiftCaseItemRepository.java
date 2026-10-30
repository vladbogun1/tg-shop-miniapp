package com.maxsolch.shop.gift.infra;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GiftCaseItemRepository extends JpaRepository<GiftCaseItem, Long> {

    List<GiftCaseItem> findAllByOrderBySortOrderAscIdAsc();

    boolean existsByTierAndProductId(GiftCaseTier.Tier tier, byte[] productId);
}
