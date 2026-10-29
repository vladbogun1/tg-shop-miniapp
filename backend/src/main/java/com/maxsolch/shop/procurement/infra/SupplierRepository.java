package com.maxsolch.shop.procurement.infra;

import com.maxsolch.shop.procurement.domain.Supplier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SupplierRepository extends JpaRepository<Supplier, Long> {

    List<Supplier> findAllByOrderByNameAsc();
}
