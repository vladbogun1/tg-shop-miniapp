package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.app.IncidentService.Found;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

import static com.maxsolch.shop.staff.app.IncidentService.AUTO;
import static com.maxsolch.shop.staff.app.IncidentService.RETURN_STUCK_DAYS;

/** The detector of «Инциденты»: what in the orders and the money journal looks wrong right now. */
@Component
public class IncidentQueries {

    private final JdbcTemplate jdbc;

    public IncidentQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Found> detect() {
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
                .withZone(com.maxsolch.shop.platform.time.ShopZone.DEFAULT).format(t.toInstant());
    }
}
