package com.maxsolch.shop.bundle;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GiftCaseItemRepository extends JpaRepository<GiftCaseItem, Long> {

    List<GiftCaseItem> findAllByOrderBySortOrderAscIdAsc();

    boolean existsByProductId(byte[] productId);
}
