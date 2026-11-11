package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.delivery.app.NovaPoshtaSenderService.SenderConfig;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import org.springframework.stereotype.Service;

/**
 * The sender block of the NP settings: what is configured, «Загрузить из кабинета НП», saving the contact and the
 * sending branches — each change goes to the admin audit. The API key itself never leaves the server.
 */
@Service
public class NpSenderAdmin {

    private final NovaPoshtaSenderService sender;
    private final NovaPoshtaGateway api;
    private final AdminAuditService audit;

    NpSenderAdmin(NovaPoshtaSenderService sender, NovaPoshtaGateway api, AdminAuditService audit) {
        this.sender = sender;
        this.api = api;
        this.audit = audit;
    }

    public record SenderResponse(SenderConfig sender, boolean keyConfigured, boolean dryRun) {
    }

    public SenderResponse current() {
        return response(sender.get().orElse(null));
    }

    public SenderResponse loadFromCabinet() {
        SenderConfig c = sender.loadFromCabinet();
        audit.record("NP_SENDER_LOAD", "SETTINGS", null, "отправитель загружен из кабинета НП: " + c.counterpartyName());
        return response(c);
    }

    public SenderResponse save(SenderConfig body) {
        if (body == null) {
            throw NpErrors.bad("Пустой запрос");
        }
        SenderConfig c = sender.save(body);
        audit.record("NP_SENDER", "SETTINGS", null, "отделения отправки: " + c.warehouses().stream()
                .map(w -> "№" + w.number()).reduce((a, b) -> a + ", " + b).orElse("—"));
        return response(c);
    }

    public NovaPoshtaSenderService.KeyCheck checkKey() {
        return sender.checkKey();
    }

    private SenderResponse response(SenderConfig c) {
        return new SenderResponse(c, api.keyConfigured(), api.dryRun());
    }
}
