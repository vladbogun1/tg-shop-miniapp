package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.audit.app.AdminAuditQueries;
import com.maxsolch.shop.notification.app.BroadcastService;
import com.maxsolch.shop.staff.domain.AdminTraces;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * What in the shop's data was done by an admin. No foreign keys point at admin_users — the rows keep the id and a
 * snapshot of the name — but deleting an admin with such history would leave «who did it» pointing at nobody, so
 * those are blocked instead. Own sign-in / account entries ({@code ADMIN_*} in the journal) do not count. Each
 * module counts its own rows: the journal and broadcasts are asked directly, the modules above staff through
 * {@link AdminTraces}.
 */
@Service
public class AdminHistory {

    private final AdminAuditQueries audit;
    private final BroadcastService broadcasts;
    private final List<AdminTraces> traces;

    public AdminHistory(AdminAuditQueries audit, BroadcastService broadcasts, List<AdminTraces> traces) {
        this.audit = audit;
        this.broadcasts = broadcasts;
        this.traces = traces;
    }

    /** @return human-readable reasons, empty when the admin can be deleted */
    public List<String> of(long adminId) {
        List<String> out = new ArrayList<>();
        add(out, "записей в журнале", audit.countWorkBy(adminId));
        add(out, "рассылок", broadcasts.countBy(adminId));
        traces.forEach(t -> add(out, t.label(), t.countBy(adminId)));
        return out;
    }

    private static void add(List<String> out, String label, long n) {
        if (n > 0) {
            out.add(label + ": " + n);
        }
    }
}
