package com.maxsolch.shop.catalog.infra;

import com.maxsolch.shop.catalog.domain.SpecAttribute;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SpecAttributeRepository extends JpaRepository<SpecAttribute, byte[]> {
}
