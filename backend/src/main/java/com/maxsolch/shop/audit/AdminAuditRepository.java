package com.maxsolch.shop.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminAuditRepository extends JpaRepository<AdminAuditEntry, Long> {

    Page<AdminAuditEntry> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
