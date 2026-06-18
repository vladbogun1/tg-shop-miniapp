package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.NovaPoshtaCity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NovaPoshtaCityRepository extends JpaRepository<NovaPoshtaCity, String> {

    List<NovaPoshtaCity> findTop50ByNameContainingIgnoreCaseOrderByNameAsc(String name);

    List<NovaPoshtaCity> findTop50ByOrderByNameAsc();
}
