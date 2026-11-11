package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.delivery.domain.NovaPoshtaCity;
import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.delivery.infra.NovaPoshtaCityRepository;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.settings.app.SettingsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Who sends the parcels: the shop's counterparty in the Nova Poshta cabinet, its contact person
 * and the branches it hands parcels in at (the owner uses two — №65 and №104 — so there is a list
 * with a default, and the waybill preview lets one pick). Kept as one JSON system key
 * ({@code system.np.sender}): it is the shop's own data, never in the public repository.
 */
@Service
public class NovaPoshtaSenderService {

    private static final Logger log = LoggerFactory.getLogger(NovaPoshtaSenderService.class);

    static final String SYSTEM_SENDER = "np.sender";

    private final NovaPoshtaGateway api;
    private final SettingsService settings;
    private final NovaPoshtaWarehouseRepository warehouses;
    private final NovaPoshtaCityRepository cities;
    private final ObjectMapper json;
    private final Clock clock;

    public NovaPoshtaSenderService(NovaPoshtaGateway api, SettingsService settings,
                                   NovaPoshtaWarehouseRepository warehouses, NovaPoshtaCityRepository cities,
                                   ObjectMapper json, Clock clock) {
        this.api = api;
        this.settings = settings;
        this.warehouses = warehouses;
        this.cities = cities;
        this.json = json;
        this.clock = clock;
    }

    /** A branch the shop hands parcels in at. */
    public record SenderWarehouse(String ref, String number, String description, String cityRef, String cityName) {
    }

    /** A contact person of the sender counterparty. */
    public record Contact(String ref, String name, String phone) {
    }

    public record SenderConfig(
            String counterpartyRef,
            String counterpartyName,
            /** Counterparty type: PrivatePerson (ФОП) / Organization. */
            String ownershipForm,
            String contactRef,
            String contactName,
            String phone,
            List<Contact> contacts,
            List<SenderWarehouse> warehouses,
            String defaultWarehouseRef,
            Instant loadedAt) {

        public boolean complete() {
            return notBlank(counterpartyRef) && notBlank(contactRef) && notBlank(phone)
                    && warehouses != null && !warehouses.isEmpty();
        }

        public Optional<SenderWarehouse> warehouse(String ref) {
            if (warehouses == null || warehouses.isEmpty()) {
                return Optional.empty();
            }
            String want = notBlank(ref) ? ref : defaultWarehouseRef;
            return warehouses.stream().filter(w -> w.ref().equals(want)).findFirst()
                    .or(() -> Optional.of(warehouses.get(0)));
        }
    }

    /** What «Проверить ключ» answers. */
    public record KeyCheck(boolean configured, boolean ok, boolean dryRun, String counterpartyName, String message) {
    }

    public Optional<SenderConfig> get() {
        return settings.system(SYSTEM_SENDER).flatMap(raw -> {
            try {
                return Optional.of(json.readValue(raw, SenderConfig.class));
            } catch (JsonProcessingException e) {
                log.warn("Unreadable {}: {}", SYSTEM_SENDER, e.getOriginalMessage());
                return Optional.empty();
            }
        });
    }

    /** The configured sender, or a readable 400 telling the admin where to set it up. */
    public SenderConfig require() {
        SenderConfig c = get().orElse(null);
        if (c == null || !c.complete()) {
            throw NpErrors.senderMissing();
        }
        return c;
    }

    /**
     * Saves what the admin edited: the contact (one of the loaded ones), the phone and the branches.
     * Branches are re-read from the local directory, so only real ones are stored.
     */
    public SenderConfig save(SenderConfig in) {
        SenderConfig base = get().orElse(null);
        if (base == null || !notBlank(base.counterpartyRef())) {
            throw NpErrors.bad("Сначала нажмите «Загрузить из кабинета НП»");
        }
        List<SenderWarehouse> whs = new ArrayList<>();
        if (in.warehouses() != null) {
            for (SenderWarehouse w : in.warehouses()) {
                if (w == null || !notBlank(w.ref()) || whs.stream().anyMatch(x -> x.ref().equals(w.ref()))) {
                    continue;
                }
                NovaPoshtaWarehouse wh = warehouses.findById(w.ref())
                        .orElseThrow(() -> NpErrors.bad("Отделение не найдено в справочнике НП: " + w.ref()));
                whs.add(toSenderWarehouse(wh));
            }
        }
        if (whs.isEmpty()) {
            throw NpErrors.bad("Добавьте хотя бы одно отделение, из которого отправляете посылки");
        }
        String wanted = in.defaultWarehouseRef();
        String def = notBlank(wanted) && whs.stream().anyMatch(w -> w.ref().equals(wanted)) ? wanted : whs.get(0).ref();
        Contact contact = base.contacts() == null ? null : base.contacts().stream()
                .filter(c -> c.ref().equals(in.contactRef())).findFirst().orElse(null);
        String contactRef = contact != null ? contact.ref() : base.contactRef();
        String contactName = contact != null ? contact.name() : base.contactName();
        String phone = normalizePhone(notBlank(in.phone()) ? in.phone() : contact != null ? contact.phone() : base.phone());
        if (phone == null) {
            throw NpErrors.bad("Телефон отправителя: 380XXXXXXXXX");
        }
        SenderConfig out = new SenderConfig(base.counterpartyRef(), base.counterpartyName(), base.ownershipForm(),
                contactRef, contactName, phone, base.contacts(), whs, def, base.loadedAt());
        write(out);
        return out;
    }

    /**
     * «Загрузить из кабинета НП»: the sender counterparty and its contact persons from the API.
     * Branches already chosen are kept; with none yet, nothing is guessed — the admin picks them.
     */
    public SenderConfig loadFromCabinet() {
        requireKey();
        JsonNode senders = api.call("Counterparty", "getCounterparties",
                Map.of("CounterpartyProperty", "Sender", "Page", "1"));
        if (senders == null || !senders.isArray() || senders.isEmpty()) {
            throw NpErrors.bad("В кабинете Новой почты не найден отправитель для этого ключа");
        }
        JsonNode s = senders.get(0);
        String ref = text(s, "Ref");
        JsonNode people = api.call("Counterparty", "getCounterpartyContactPersons", Map.of("Ref", ref, "Page", "1"));
        List<Contact> contacts = new ArrayList<>();
        if (people != null && people.isArray()) {
            for (JsonNode p : people) {
                contacts.add(new Contact(text(p, "Ref"), text(p, "Description"), normalizePhone(text(p, "Phones"))));
            }
        }
        if (contacts.isEmpty()) {
            throw NpErrors.bad("У отправителя в кабинете НП нет контактного лица — добавьте его в кабинете");
        }
        SenderConfig old = get().orElse(null);
        Contact chosen = old == null ? contacts.get(0) : contacts.stream()
                .filter(c -> c.ref().equals(old.contactRef())).findFirst().orElse(contacts.get(0));
        String phone = old != null && notBlank(old.phone()) && chosen.ref().equals(old.contactRef())
                ? old.phone() : chosen.phone();
        List<SenderWarehouse> whs = old == null || old.warehouses() == null ? List.of() : old.warehouses();
        SenderConfig out = new SenderConfig(ref, text(s, "Description"), text(s, "OwnershipFormDescription"),
                chosen.ref(), chosen.name(), phone, contacts, whs,
                old == null ? null : old.defaultWarehouseRef(), clock.instant());
        write(out);
        return out;
    }

    /** «Проверить ключ»: one cheap authorised call. Never throws — the answer is the message. */
    public KeyCheck checkKey() {
        if (!api.keyConfigured()) {
            return new KeyCheck(false, false, api.dryRun(), null,
                    "Ключ API не задан (NOVAPOSHTA_API_KEY в .env сервера). Справочник отделений работает и без него.");
        }
        try {
            JsonNode senders = api.call("Counterparty", "getCounterparties",
                    Map.of("CounterpartyProperty", "Sender", "Page", "1"));
            String name = senders != null && senders.isArray() && !senders.isEmpty()
                    ? text(senders.get(0), "Description") : null;
            return new KeyCheck(true, true, api.dryRun(), name,
                    name == null ? "Ключ принят, но отправителя в кабинете нет" : "Ключ работает: " + name);
        } catch (NovaPoshtaException e) {
            return new KeyCheck(true, false, api.dryRun(), null, e.reason());
        } catch (RuntimeException e) {
            return new KeyCheck(true, false, api.dryRun(), null, "Новая почта не ответила: " + e.getMessage());
        }
    }

    private void requireKey() {
        if (!api.keyConfigured()) {
            throw NpErrors.keyMissing();
        }
    }

    private void write(SenderConfig c) {
        try {
            settings.putSystem(SYSTEM_SENDER, json.writeValueAsString(c));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    SenderWarehouse toSenderWarehouse(NovaPoshtaWarehouse wh) {
        String cityName = wh.getCityName();
        if (cityName == null) {
            cityName = cities.findById(wh.getCityRef()).map(NovaPoshtaCity::getName).orElse(null);
        }
        return new SenderWarehouse(wh.getRef(), wh.getNumber(), wh.getDescription(), wh.getCityRef(), cityName);
    }

    /** 380XXXXXXXXX, or null when it cannot be one. */
    public static String normalizePhone(String raw) {
        if (raw == null) {
            return null;
        }
        String d = raw.replaceAll("\\D", "");
        if (d.length() == 10 && d.startsWith("0")) {
            d = "38" + d;
        } else if (d.length() == 9) {
            d = "380" + d;
        }
        return d.length() == 12 && d.startsWith("380") ? d : null;
    }

    private static String text(JsonNode n, String f) {
        JsonNode v = n == null ? null : n.get(f);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
