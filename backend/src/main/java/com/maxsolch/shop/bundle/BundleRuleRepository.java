package com.maxsolch.shop.bundle;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BundleRuleRepository extends JpaRepository<BundleRule, Long> {

    List<BundleRule> findAllByOrderBySortOrderAscIdAsc();

    boolean existsBySourceCategoryIdAndTargetCategoryId(byte[] sourceCategoryId, byte[] targetCategoryId);
}
