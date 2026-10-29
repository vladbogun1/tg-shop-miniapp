package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.AdminIncident;
import com.maxsolch.shop.repository.AdminIncidentRepository;
import com.maxsolch.shop.platform.error.BadRequestException;
import com.maxsolch.shop.platform.error.NotFoundException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
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
    private final JdbcTemplate jdbc;

    public IncidentService(AdminIncidentRepository repository, JdbcTemplate jdbc) {
        this.repository = repository;
        this.jdbc = jdbc;
    }

    /** A case found in the data right now. */
    record Found(String code, String title, String orderRef, String severity, String facts, String hypothesis,
                 String suggestion) {
    }

    @Transactional
    public List<AdminIncident> list() {
        sync(detect());
        return repository.findAllByOrderByStatusAscCreatedAtDesc();
    }

    @Transactional
    public AdminIncident resolve(long id, String resolution, String adminName) {
        AdminIncident i = repository.findById(id).orElseThrow(() -> new NotFoundException("Инцидент не найден"));
        String text = resolution == null ? "" : resolution.trim();
        if (text.length() < 3) {
            throw new BadRequestException("Напишите, чем закончилось (хотя бы пару слов)");
        }
        i.setStatus(AdminIncident.RESOLVED);
        i.setResolution(text.length() > 1000 ? text.substring(0, 1000) : text);
        i.setResolvedBy(adminName);
        i.setResolvedAt(Instant.now());
        return repository.save(i);
    }

    @Transactional
    public AdminIncident reopen(long id) {
        AdminIncident i = repository.findById(id).orElseThrow(() -> new NotFoundException("Инцидент не найден"));
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
                    i.setResolvedAt(Instant.now());
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

    List<Found> detect() {
        List<Found> out = new ArrayList<>();
        out.addAll(rejectedWithMoney());
        out.addAll(ledgerDrift());
        out.addAll(returnStuck());
        out.addAll(deletedOrders());
        return out;
    }

    /** Refused orders that kept customer money with no «удержано за доставку» entry. */
    private List<Found> rejectedWithMoney() {
        return jdbc.query("""
                select bin_to_uuid(o.id) ref, o.total_minor, o.prepayment_minor, o.received_minor, o.refunded_minor,
                       o.reject_reason_code, o.rejected_at
                from orders o
                where o.status = 'REJECTED' and o.received_minor > o.refunded_minor
                  and not exists (select 1 from order_money_movements m where m.order_id = o.id and m.kind = 'RETAINED')
                """, (rs, n) -> {
            String ref = rs.getString("ref");
            long kept = rs.getLong("received_minor") - rs.getLong("refunded_minor");
            String facts = "Сумма заказа " + uah(rs.getLong("total_minor"))
                    + ", предоплата " + uah(rs.getLong("prepayment_minor"))
                    + ", получено " + uah(rs.getLong("received_minor"))
                    + ", возвращено " + uah(rs.getLong("refunded_minor"))
                    + ". Отклонён " + when(rs.getTimestamp("rejected_at"))
                    + (rs.getString("reject_reason_code") == null ? "" : ", причина " + rs.getString("reject_reason_code"))
                    + ".";
            return new Found(AUTO + "rejected-kept:" + ref, "Отклонён, у магазина осталось " + uah(kept), ref,
                    kept > rs.getLong("prepayment_minor") && rs.getLong("prepayment_minor") > 0 ? "HIGH" : "MEDIUM",
                    facts,
                    "Деньги клиента остались у магазина, но в журнале нет ни возврата, ни «удержано за доставку». "
                            + "Либо это предоплата за доставку при отказе (тогда всё в порядке), либо возврат сделали "
                            + "вне админки и не отметили.",
                    "Если это предоплата за доставку — оформите в мастере возврата «удержать». Если деньги "
                            + "вернули — внесите возврат с каналом. Если клиенту должны — верните.");
        });
    }

    /** The money journal and the order totals disagree: something changed money outside the journal. */
    private List<Found> ledgerDrift() {
        return jdbc.query("""
                select bin_to_uuid(o.id) ref, o.status, o.received_minor, o.refunded_minor, j.net
                from orders o
                join (select order_id,
                             sum(case kind when 'PAYMENT' then amount_minor when 'CORRECTION' then amount_minor
                                           when 'REFUND' then -amount_minor else 0 end) net
                      from order_money_movements group by order_id) j on j.order_id = o.id
                where j.net <> o.received_minor - o.refunded_minor
                """, (rs, n) -> {
            String ref = rs.getString("ref");
            long net = rs.getLong("net");
            long totals = rs.getLong("received_minor") - rs.getLong("refunded_minor");
            return new Found(AUTO + "ledger-drift:" + ref, "Журнал денег не сходится с заказом", ref, "MEDIUM",
                    "Статус " + rs.getString("status") + ". По журналу у магазина " + uah(net)
                            + ", по заказу (получено − возвращено) " + uah(totals) + ", разница " + uah(totals - net) + ".",
                    "Сумму в заказе поменяли в обход журнала (старая версия, ручной SQL) или запись в журнал не дошла.",
                    "Сверьте с банком/НП и внесите приход или корректировку с комментарием.");
        });
    }

    /** A refused parcel marked «едет назад» that never arrived. */
    private List<Found> returnStuck() {
        return jdbc.query("""
                select bin_to_uuid(o.id) ref, o.total_minor, coalesce(o.return_sent_at, o.rejected_at) rejected_at, o.tracking_number
                from orders o
                where o.return_status = 'IN_TRANSIT' and coalesce(o.return_sent_at, o.rejected_at) < now() - interval ? day
                """, (rs, n) -> {
            String ref = rs.getString("ref");
            return new Found(AUTO + "return-stuck:" + ref, "Посылка едет назад дольше " + RETURN_STUCK_DAYS + " дней",
                    ref, "MEDIUM",
                    "Сумма заказа " + uah(rs.getLong("total_minor")) + ", отправлен назад " + when(rs.getTimestamp("rejected_at"))
                            + (rs.getString("tracking_number") == null ? "" : ", ТТН " + rs.getString("tracking_number")) + ".",
                    "Посылка застряла на отделении/складе НП или её получили, но не отметили «Посылка вернулась».",
                    "Проверьте ТТН в НП; если товар уже дома — нажмите «Посылка вернулась», иначе заберите или "
                            + "подайте претензию.");
        }, RETURN_STUCK_DAYS);
    }

    /** Orders deleted for good before V68 (the audit log still remembers them). */
    private List<Found> deletedOrders() {
        return jdbc.query("""
                select a.entity_id ref, max(a.admin_name) who, max(a.created_at) at, max(a.details) details
                from admin_audit_log a
                where a.action = 'ORDER_DELETE' and a.entity_id is not null
                  and not exists (select 1 from orders o where bin_to_uuid(o.id) = a.entity_id)
                group by a.entity_id
                """, (rs, n) -> {
            String ref = rs.getString("ref");
            String details = rs.getString("details");
            // A refused order deleted is usually an abandoned one; anything else lost a real sale.
            String severity = details != null && details.contains("статус REJECTED") ? "MEDIUM" : "HIGH";
            return new Found(AUTO + "deleted:" + ref, "Заказ удалён безвозвратно (до архива)", ref, severity,
                    "Удалил: " + (rs.getString("who") == null ? "—" : rs.getString("who")) + ", "
                            + when(rs.getTimestamp("at")) + (details == null || details.isBlank() ? "" : ". Запись: " + details),
                    "Заказ стёрт старой кнопкой «Удалить»: вместе с ним пропали позиции и счёт, в метриках его нет.",
                    "Проверьте, были ли по нему деньги и товар; при необходимости восстановим из дампа как архивный.");
        });
    }

    private static String uah(long minor) {
        return com.maxsolch.shop.platform.util.MoneyFormat.uah(minor);
    }

    private static String when(java.sql.Timestamp t) {
        return t == null ? "—" : java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
                .withZone(java.time.ZoneId.of("Europe/Kyiv")).format(t.toInstant());
    }
}
