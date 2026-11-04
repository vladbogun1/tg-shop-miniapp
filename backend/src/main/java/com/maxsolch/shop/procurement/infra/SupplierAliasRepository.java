package com.maxsolch.shop.procurement.infra;

import com.maxsolch.shop.procurement.domain.SupplierAlias;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface SupplierAliasRepository extends JpaRepository<SupplierAlias, Long> {

    List<SupplierAlias> findAllBySupplierId(Long supplierId);

    List<SupplierAlias> findAllBySupplierIdAndSourceKeyIn(Long supplierId, Collection<String> sourceKeys);
}
