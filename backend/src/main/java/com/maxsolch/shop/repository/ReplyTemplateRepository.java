package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.ReplyTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReplyTemplateRepository extends JpaRepository<ReplyTemplate, Long> {

    List<ReplyTemplate> findAllByOrderBySortAscIdAsc();
}
