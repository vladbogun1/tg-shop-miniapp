package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.NpTrackingPush;
import com.maxsolch.shop.delivery.domain.NpTrackingPush.Subscription;
import com.maxsolch.shop.delivery.infra.DeliveryProperties;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.regex.Pattern;

/**
 * «Миттєві статуси» in the NP settings: subscribe this server to tracking pushes (type {@code legal} — every waybill
 * where the shop is the sender, also those made by hand in the cabinet), see and delete the subscriptions. The
 * secret and the URL come from the environment (NOVAPOSHTA_WEBHOOK_SECRET / NOVAPOSHTA_WEBHOOK_URL) and are never
 * sent to the browser.
 */
@Service
public class NpWebhookSubscriptions {

    /** What NP accepts as secretToken. */
    static final Pattern SECRET = Pattern.compile("[A-Za-z0-9]{16,600}");

    private final DeliveryProperties props;
    private final NpTrackingPush push;
    private final NovaPoshtaGateway api;
    private final AdminAuditService audit;

    NpWebhookSubscriptions(DeliveryProperties props, NpTrackingPush push, NovaPoshtaGateway api,
                           AdminAuditService audit) {
        this.props = props;
        this.push = push;
        this.api = api;
        this.audit = audit;
    }

    /**
     * @param configured secret and https URL are set on the server
     * @param error why the list could not be read (no key, NP down…); null when it was
     */
    public record WebhookStatus(boolean configured, String url, List<Subscription> subscriptions, String error) {
    }

    public WebhookStatus status() {
        String url = url();
        boolean configured = url != null && secret() != null;
        if (!api.keyConfigured()) {
            return new WebhookStatus(configured, url, List.of(), "Ключ API не настроен");
        }
        try {
            return new WebhookStatus(configured, url, push.list(), null);
        } catch (RuntimeException e) {
            return new WebhookStatus(configured, url, List.of(), e.getMessage());
        }
    }

    /** {@code companyTin}: blank = the ЄДРПОУ/ІПН of the sender counterparty from the cabinet. */
    public Subscription subscribe(String companyTin) {
        String url = url();
        String secret = secret();
        if (url == null || secret == null) {
            throw NpErrors.bad("На сервере не заданы NOVAPOSHTA_WEBHOOK_URL (https) и NOVAPOSHTA_WEBHOOK_SECRET");
        }
        if (!SECRET.matcher(secret).matches()) {
            throw NpErrors.bad("NOVAPOSHTA_WEBHOOK_SECRET: только латиница и цифры, от 16 символов");
        }
        String tin = companyTin == null ? "" : companyTin.replaceAll("\\s", "");
        if (tin.isEmpty()) {
            tin = senderTin();
        }
        if (tin == null || tin.isEmpty()) {
            throw NpErrors.bad("Не удалось узнать ЄДРПОУ/ІПН отправителя — введите его вручную");
        }
        boolean exists = push.list().stream()
                .anyMatch(s -> url.equals(s.url()) && "legal".equals(s.type()) && s.active());
        if (exists) {
            throw NpErrors.bad("Подписка на этот адрес уже есть");
        }
        Subscription s = push.createLegal(url, secret, List.of(tin));
        audit.record("NP_WEBHOOK_SUBSCRIBE", "SETTINGS", s.id(), "Подписка legal на " + url);
        return s;
    }

    public void unsubscribe(String id) {
        // Only ours: the business key may also see subscriptions made by other integrations.
        String url = url();
        boolean ours = push.list().stream().anyMatch(s -> id.equals(s.id()) && url != null && url.equals(s.url()));
        if (!ours) {
            throw NpErrors.bad("Эта подписка не на адрес этого сервера — удалять её отсюда нельзя");
        }
        push.delete(id);
        audit.record("NP_WEBHOOK_UNSUBSCRIBE", "SETTINGS", id, "Подписка удалена");
    }

    private String senderTin() {
        ObjectNode p = api.props();
        p.put("CounterpartyProperty", "Sender");
        p.put("Page", "1");
        JsonNode data = api.call("Counterparty", "getCounterparties", p);
        if (data == null || !data.isArray() || data.isEmpty()) {
            return null;
        }
        String tin = NpJson.text(data.get(0), "EDRPOU");
        return tin == null ? null : tin.replaceAll("\\s", "");
    }

    private String url() {
        String u = props.getNovaposhta().getWebhookUrl();
        return u == null || !u.trim().startsWith("https://") ? null : u.trim();
    }

    private String secret() {
        String s = props.getNovaposhta().getWebhookSecret();
        return s == null || s.isBlank() ? null : s.trim();
    }
}
