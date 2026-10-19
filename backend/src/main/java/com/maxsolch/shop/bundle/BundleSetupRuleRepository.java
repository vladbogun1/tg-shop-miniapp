package com.maxsolch.shop.bundle;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BundleSetupRuleRepository extends JpaRepository<BundleSetupRule, Long> {

    List<BundleSetupRule> findAllByOrderBySortOrderAscIdAsc();

    boolean existsBySourceCategoryIdAndTargetCategoryId(byte[] sourceCategoryId, byte[] targetCategoryId);
}
