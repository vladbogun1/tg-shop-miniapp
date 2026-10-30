package com.maxsolch.shop.audit.app;

import com.maxsolch.shop.audit.domain.AdminAuditEntry;
import com.maxsolch.shop.audit.infra.AdminAuditRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/** Reads of the admin action log for the «Журнал» screen and the order/product card history. */
@Service
@Transactional(readOnly = true)
public class AdminAuditQueries {

    private final AdminAuditRepository repository;

    public AdminAuditQueries(AdminAuditRepository repository) {
        this.repository = repository;
    }

    /** Newest first; every filter is optional (null = any). */
    public List<AdminAuditEntry> search(String action, String entityType, String entityId, Long adminId,
                                        Instant from, Instant to, int page, int size) {
        return repository.search(action, entityType, entityId, adminId, from, to, PageRequest.of(page, size));
    }

    /** (admin id, admin name) pairs seen in the log. */
    public List<Object[]> admins() {
        return repository.admins();
    }

    public List<String> distinctActions() {
        return repository.distinctActions();
    }

    public List<String> distinctEntityTypes() {
        return repository.distinctEntityTypes();
    }
}
