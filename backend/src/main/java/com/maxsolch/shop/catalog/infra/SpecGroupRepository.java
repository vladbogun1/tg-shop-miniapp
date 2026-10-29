package com.maxsolch.shop.catalog.infra;

import com.maxsolch.shop.catalog.domain.SpecGroup;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SpecGroupRepository extends JpaRepository<SpecGroup, String> {
}
