package com.maxsolch.shop.audit;

import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.web.SecurityUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Records who did what in the admin panel.
 *
 * <p>Nothing used to be written down: an order could be deleted, a payment un-marked or a discount
 * handed out with no trace of which admin did it. Every entry is written in its own transaction so
 * a failed business operation still leaves the attempt visible, and a failure to audit never fails
 * the operation itself.
 */
@Slf4j
@Service
public class AdminAuditService {

    /** Fallback display name for the order chat when the admin row has none. */
    public static final String DEFAULT_ADMIN_NAME = "Менеджер";

    private final AdminAuditRepository repository;
    private final AdminUserRepository adminUserRepository;

    public AdminAuditService(AdminAuditRepository repository,
                             AdminUserRepository adminUserRepository) {
        this.repository = repository;
        this.adminUserRepository = adminUserRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String action, String entityType, String entityId, String details) {
        try {
            AuthPrincipal principal = SecurityUtil.currentPrincipal();
            if (principal.role() != Role.ADMIN) {
                return;
            }
            AdminAuditEntry entry = new AdminAuditEntry();
            entry.setAdminId(principal.telegramUserId());
            entry.setAdminName(displayName(principal.telegramUserId()));
            entry.setAction(action);
            entry.setEntityType(entityType);
            entry.setEntityId(entityId);
            entry.setDetails(trim(details));
            repository.save(entry);
        } catch (Exception e) {
            // Auditing is observability, not business logic — never break the action over it.
            log.warn("Failed to write audit entry {}/{}: {}", action, entityId, e.getMessage());
        }
    }

    /**
     * Human-readable name of the current admin, for the audit log and as the author of chat
     * messages (which used to be signed with a hardcoded "Менеджер" no matter who wrote them).
     */
    @Transactional(readOnly = true)
    public String currentAdminName() {
        try {
            return displayName(SecurityUtil.currentUserId());
        } catch (Exception e) {
            return DEFAULT_ADMIN_NAME;
        }
    }

    private String displayName(long adminId) {
        return adminUserRepository.findById(adminId)
                .map(AdminAuditService::nameOf)
                .orElse(DEFAULT_ADMIN_NAME);
    }

    private static String nameOf(AdminUser admin) {
        if (admin.getName() != null && !admin.getName().isBlank()) {
            return admin.getName().trim();
        }
        if (admin.getUsername() != null && !admin.getUsername().isBlank()) {
            return admin.getUsername().trim();
        }
        return DEFAULT_ADMIN_NAME;
    }

    private static String trim(String s) {
        if (s == null) {
            return null;
        }
        return s.length() <= 1024 ? s : s.substring(0, 1021) + "...";
    }
}
