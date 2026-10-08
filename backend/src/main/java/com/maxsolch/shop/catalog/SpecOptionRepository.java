package com.maxsolch.shop.catalog;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SpecOptionRepository extends JpaRepository<SpecOption, byte[]> {

    @Query("select o from SpecOption o where o.attributeId = :id order by o.sortOrder, o.value")
    List<SpecOption> findByAttribute(@Param("id") byte[] attributeId);
}
