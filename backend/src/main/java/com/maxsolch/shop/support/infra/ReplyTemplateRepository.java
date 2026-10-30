package com.maxsolch.shop.support.infra;

import com.maxsolch.shop.support.domain.ReplyTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReplyTemplateRepository extends JpaRepository<ReplyTemplate, Long> {

    List<ReplyTemplate> findAllByOrderBySortAscIdAsc();
}
