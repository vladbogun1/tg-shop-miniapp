package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.ai.domain.SubjectEditors;
import com.maxsolch.shop.audit.app.AdminAuditQueries;
import com.maxsolch.shop.audit.domain.AdminAuditEntry;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Who edited a product card after an AI task started ({@link SubjectEditors}) — from the admin audit, the only place
 * that keeps the person and the time of a product edit ({@code card_meta} keeps the source of a value, not its editor;
 * the product has no «updated by»). The actions that change the fields of the card count: the product form, the card
 * import (one product) and the accepted card. The audit names the person, not the field.
 */
@Component
public class ProductCardEditors implements SubjectEditors {

    static final Set<String> CARD_ACTIONS = Set.of("PRODUCT_UPDATE", "CARDS_IMPORT", "CARD_ACCEPT");
    private static final int LOOK_BACK = 100;

    private final AdminAuditQueries audit;

    public ProductCardEditors(AdminAuditQueries audit) {
        this.audit = audit;
    }

    @Override
    public String subjectType() {
        return CardAiJobs.SUBJECT;
    }

    @Override
    public List<Edit> since(String subjectId, Instant since) {
        List<AdminAuditEntry> entries = audit.search(null, CardAiJobs.SUBJECT, subjectId, null, since, null, 0, LOOK_BACK);
        Map<String, Instant> last = new LinkedHashMap<>();
        for (AdminAuditEntry e : entries) {
            if (CARD_ACTIONS.contains(e.getAction()) && e.getAdminName() != null && !e.getAdminName().isBlank()) {
                last.putIfAbsent(e.getAdminName(), e.getCreatedAt());
            }
        }
        List<Edit> out = new ArrayList<>();
        last.forEach((who, at) -> out.add(new Edit(who, at)));
        return out;
    }
}
