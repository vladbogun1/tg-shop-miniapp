package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.domain.StaffError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.staff.domain.AdminIncident;
import com.maxsolch.shop.staff.infra.AdminIncidentRepository;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * «Инциденты» (V68, super admin only). Each list call re-runs the detector over the data: new
 * cases become OPEN rows ({@code code = auto:<kind>:<order>}), an OPEN auto case whose condition
 * no longer holds closes itself. Hand-made cards (with a hypothesis) are plain rows of the table.
 * Facts carry amounts, statuses and dates only — no customer contacts.
 */
@Service
public class IncidentService {

    static final String AUTO = "auto:";
    /** A refused parcel that has been «on its way back» longer than this is worth a look. */
    static final int RETURN_STUCK_DAYS = 21;

    private final AdminIncidentRepository repository;
    private final IncidentQueries queries;
    private final AdminAuditService audit;
    private final Clock clock;

    public IncidentService(AdminIncidentRepository repository, IncidentQueries queries, AdminAuditService audit,
                           Clock clock) {
        this.repository = repository;
        this.queries = queries;
        this.audit = audit;
        this.clock = clock;
    }

    /** A case found in the data right now. */
    record Found(String code, String title, String orderRef, String severity, String facts, String hypothesis,
                 String suggestion) {
    }

    @Transactional
    public List<AdminIncident> list() {
        sync(queries.detect());
        return repository.findAllByOrderByStatusAscCreatedAtDesc();
    }

    @Transactional
    public AdminIncident resolve(long id, String resolution, String adminName) {
        AdminIncident i = repository.findById(id).orElseThrow(() -> new DomainException.NotFound(StaffError.INCIDENT_NOT_FOUND));
        String text = resolution == null ? "" : resolution.trim();
        if (text.length() < 3) {
            throw new DomainException.BadRequest(StaffError.OUTCOME_REQUIRED);
        }
        i.setStatus(AdminIncident.RESOLVED);
        i.setResolution(text.length() > 1000 ? text.substring(0, 1000) : text);
        i.setResolvedBy(adminName);
        i.setResolvedAt(clock.instant());
        return repository.save(i);
    }

    /** Closes the case as the current admin and writes it to the audit. */
    @Transactional
    public AdminIncident resolveAsAdmin(long id, String resolution) {
        AdminIncident i = resolve(id, resolution, audit.currentAdminName());
        audit.record("INCIDENT_RESOLVE", "INCIDENT", String.valueOf(id), i.getTitle() + ": " + i.getResolution());
        return i;
    }

    /** Opens the case again and writes it to the audit. */
    @Transactional
    public AdminIncident reopenAsAdmin(long id) {
        AdminIncident i = reopen(id);
        audit.record("INCIDENT_REOPEN", "INCIDENT", String.valueOf(id), i.getTitle());
        return i;
    }

    @Transactional
    public AdminIncident reopen(long id) {
        AdminIncident i = repository.findById(id).orElseThrow(() -> new DomainException.NotFound(StaffError.INCIDENT_NOT_FOUND));
        i.setStatus(AdminIncident.OPEN);
        i.setResolvedAt(null);
        i.setResolvedBy(null);
        return repository.save(i);
    }

    /** New cases → OPEN rows; OPEN auto rows no longer found → RESOLVED by the system. */
    void sync(List<Found> found) {
        Map<String, Found> byCode = found.stream()
                .collect(Collectors.toMap(Found::code, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        Set<String> known = new HashSet<>();
        for (AdminIncident i : repository.findAll()) {
            known.add(i.getCode());
            if (i.getCode().startsWith(AUTO) && AdminIncident.OPEN.equals(i.getStatus())) {
                Found f = byCode.get(i.getCode());
                if (f == null) {
                    i.setStatus(AdminIncident.RESOLVED);
                    i.setResolution("Закрыт автоматически: в данных этого больше нет");
                    i.setResolvedBy("система");
                    i.setResolvedAt(clock.instant());
                    repository.save(i);
                } else if (i.getFacts() == null) {
                    // Facts are written once: a hand-loaded card keeps its own wording.
                    i.setFacts(f.facts());
                    repository.save(i);
                }
            }
        }
        List<AdminIncident> fresh = new ArrayList<>();
        for (Found f : byCode.values()) {
            if (known.contains(f.code())) {
                continue;
            }
            AdminIncident i = new AdminIncident();
            i.setCreatedAt(clock.instant());
            i.setCode(f.code());
            i.setTitle(f.title());
            i.setOrderRef(f.orderRef());
            i.setSeverity(f.severity());
            i.setFacts(f.facts());
            i.setHypothesis(f.hypothesis());
            i.setSuggestion(f.suggestion());
            fresh.add(i);
        }
        repository.saveAll(fresh);
    }
}
