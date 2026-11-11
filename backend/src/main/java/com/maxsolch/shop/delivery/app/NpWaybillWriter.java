package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.delivery.app.Prepared.NpResult;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.WaybillRequest;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * The waybill at Nova Poshta: recipient, address and {@code InternetDocument.save/update/delete}. Every write is
 * sent once ({@link NovaPoshtaGateway#write}); a {@code save} NP left unanswered is looked up by our order number
 * ({@code InfoRegClientBarcodes}) and the order is marked ({@code system.np.uncertain.<orderId>}) so the next
 * «Створити ТТН» looks again instead of making a second waybill. Under {@code NP_DRY_RUN} nothing is sent.
 */
@Slf4j
@Component
class NpWaybillWriter {

    static final String UNCERTAIN_PREFIX = "np.uncertain.";
    private static final DateTimeFormatter NP_DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    /** Street kinds people type in front of the name; NP keeps the kind apart (StreetsType). */
    private static final Pattern STREET_KIND = Pattern.compile(
            "^(вулиця|вул|улица|ул|проспект|просп|пр-т|пр|провулок|пров|переулок|пер|бульвар|бул|б-р|площа|пл"
                    + "|площадь|узвіз|шосе|набережна|наб)\\.?\\s+",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private final NovaPoshtaGateway api;
    private final SettingsService settings;
    private final ShopZone zone;
    private final Clock clock;

    NpWaybillWriter(NovaPoshtaGateway api, SettingsService settings, ShopZone zone, Clock clock) {
        this.api = api;
        this.settings = settings;
        this.zone = zone;
        this.clock = clock;
    }

    boolean dryRun() {
        return api.dryRun();
    }

    /** A made-up waybill of the dry run. */
    static NpResult fake(Prepared p) {
        return new NpResult(DryRunLabels.fakeRef(), DryRunLabels.fakeNumber(), null, p.date().plusDays(1));
    }

    /** {@code InternetDocument.save} at most once per order (see the class note). */
    NpResult saveOnce(Prepared p) {
        String mark = UNCERTAIN_PREFIX + p.orderId();
        if (settings.system(mark).filter(v -> !v.isBlank()).isPresent()) {
            Optional<NpResult> earlier = findByBarcode(p.shortId(), p.date());
            if (earlier.isPresent()) {
                log.warn("NP waybill {} of order {} found after an unanswered save", earlier.get().number(),
                        p.shortId());
                settings.putSystem(mark, "");
                return earlier.get();
            }
        }
        try {
            NpResult r = save(p, null);
            settings.putSystem(mark, "");
            return r;
        } catch (NovaPoshtaException e) {
            if (!e.isUncertain()) {
                throw e;
            }
            markUncertain(p.orderId());
            Optional<NpResult> made = findByBarcode(p.shortId(), p.date());
            if (made.isPresent()) {
                settings.putSystem(mark, "");
                return made.get();
            }
            throw new DomainException.BadRequest(DeliveryError.NP_UNCERTAIN, "Новая почта не ответила вовремя — "
                    + "ТТН могла создаться. Проверьте кабинет Новой почты (номер заказа " + p.shortId()
                    + " в поле «Інформація про відправлення»); повторное «Создать ТТН» сначала поищет её там "
                    + "и не создаст вторую");
        }
    }

    /** The waybill exists at NP but is not saved here: the next «Створити ТТН» finds it instead of making one. */
    void markUncertain(String orderId) {
        settings.putSystem(UNCERTAIN_PREFIX + orderId, String.valueOf(clock.millis()));
    }

    /** Our waybill of the order in NP's list around {@code date}, by our order number; empty if not listed. */
    Optional<NpResult> findByBarcode(String barcode, LocalDate date) {
        try {
            LocalDate today = zone.today(clock);
            LocalDate from = date == null || date.isAfter(today) ? today : date;
            ObjectNode q = api.props();
            q.put("DateTimeFrom", from.minusDays(1).format(NP_DATE));
            q.put("DateTimeTo", from.plusDays(7).format(NP_DATE));
            q.put("GetFullList", "1");
            q.put("Page", "1");
            JsonNode data = api.call("InternetDocument", "getDocumentList", q);
            if (data == null || !data.isArray()) {
                return Optional.empty();
            }
            for (JsonNode d : data) {
                String code = ShipmentPreparation.firstNonBlank(NpJson.trimmed(d, "InfoRegClientBarcodes"),
                        NpJson.trimmed(d, "ClientBarcode"));
                String number = NpJson.trimmed(d, "IntDocNumber");
                if (barcode.equalsIgnoreCase(String.valueOf(code)) && number != null) {
                    return Optional.of(new NpResult(NpJson.trimmed(d, "Ref"), number, NpJson.minor(d, "CostOnSite"),
                            NpJson.date(NpJson.text(d, "EstimatedDeliveryDate"))));
                }
            }
        } catch (RuntimeException e) {
            log.warn("NP waybill lookup for order {} failed: {}", barcode, e.getMessage());
        }
        return Optional.empty();
    }

    /** Recipient (+ courier address) and the waybill; {@code existingRef} non-null = {@code update} of it. */
    NpResult save(Prepared p, String existingRef) {
        ObjectNode cp = api.props();
        cp.put("CounterpartyType", "PrivatePerson");
        cp.put("CounterpartyProperty", "Recipient");
        cp.put("LastName", p.lastName());
        cp.put("FirstName", p.firstName());
        cp.put("MiddleName", p.middleName() == null ? "" : p.middleName());
        cp.put("Phone", p.phone());
        cp.put("Email", "");
        JsonNode created = first(prepWrite("Counterparty", "save", cp), "Counterparty.save");
        String recipientRef = NpJson.trimmed(created, "Ref");
        JsonNode contacts = created.path("ContactPerson").path("data");
        String contactRef = contacts.isArray() && !contacts.isEmpty() ? NpJson.trimmed(contacts.get(0), "Ref") : null;
        if (recipientRef == null || contactRef == null) {
            throw NovaPoshtaException.rejected("Новая почта не создала получателя");
        }
        String recipientAddress = p.destRef();
        if (p.service() == NpServiceType.DOORS) {
            ObjectNode a = api.props();
            a.put("CounterpartyRef", recipientRef);
            a.put("StreetRef", p.streetRef() != null ? p.streetRef() : findStreet(p.cityRef(), p.streetName()));
            a.put("BuildingNumber", p.building());
            a.put("Flat", p.flat() == null ? "" : p.flat());
            recipientAddress = NpJson.trimmed(first(prepWrite("Address", "save", a), "Address.save"), "Ref");
        }
        WaybillRequest.Spec spec = new WaybillRequest.Spec(existingRef,
                new WaybillRequest.Party(p.sender().counterpartyRef(), p.sender().contactRef(), p.sender().phone(),
                        p.from().cityRef(), p.from().ref()),
                new WaybillRequest.Party(recipientRef, contactRef, p.phone(), p.cityRef(), recipientAddress),
                p.service().npServiceType(), p.service() == NpServiceType.POSTOMAT, p.parcel(), p.declaredMinor(),
                p.collectCod() ? p.codMinor() : 0, p.description(), p.date(), p.shortId(), null);
        String method = existingRef == null ? "save" : "update";
        JsonNode doc = first(api.write("InternetDocument", method, WaybillRequest.build(spec)),
                "InternetDocument." + method);
        String number = NpJson.trimmed(doc, "IntDocNumber");
        if (number == null) {
            throw NovaPoshtaException.rejected("Новая почта не вернула номер ТТН");
        }
        return new NpResult(ShipmentPreparation.firstNonBlank(NpJson.trimmed(doc, "Ref"), existingRef), number,
                NpJson.minor(doc, "CostOnSite"), NpJson.date(NpJson.text(doc, "EstimatedDeliveryDate")));
    }

    /** {@code InternetDocument.delete}; an unanswered one says to repeat ({@code what}: «Отменить ТТН» …). */
    void delete(String npRef, String ttn, String what) {
        ObjectNode d = api.props();
        d.put("DocumentRefs", npRef);
        try {
            api.write("InternetDocument", "delete", d);
        } catch (NovaPoshtaException e) {
            if (e.isUncertain()) {
                throw new DomainException.BadRequest(DeliveryError.NP_UNCERTAIN, "Новая почта не ответила вовремя — ТТН "
                        + ttn + " могла не удалиться. Повторите «" + what + "»");
            }
            throw e;
        }
    }

    /** NP refuses to change a waybill whose label was printed. */
    static boolean printedAtNp(RuntimeException e) {
        String m = e instanceof NovaPoshtaException n ? n.reason() : e.getMessage();
        return m != null && m.toLowerCase(java.util.Locale.ROOT).contains("already printed");
    }

    /** Recipient and address writes are safe to repeat: an unanswered one is plain «NP unavailable». */
    private JsonNode prepWrite(String model, String method, ObjectNode props) {
        try {
            return api.write(model, method, props);
        } catch (NovaPoshtaException e) {
            if (e.isUncertain()) {
                throw NovaPoshtaException.unavailable(e.reason());
            }
            throw e;
        }
    }

    /** The Ref of a street typed by hand: the exact name in the city, or the only match. */
    String findStreet(String cityRef, String typed) {
        String name = STREET_KIND.matcher(typed.trim()).replaceFirst("").trim();
        ObjectNode q = api.props();
        q.put("CityRef", cityRef);
        q.put("FindByString", name.length() > 60 ? name.substring(0, 60) : name);
        q.put("Page", "1");
        q.put("Limit", "25");
        JsonNode data = api.call("Address", "getStreet", q);
        List<JsonNode> found = new ArrayList<>();
        if (data != null && data.isArray()) {
            data.forEach(found::add);
        }
        Optional<String> exact = found.stream()
                .filter(n -> name.equalsIgnoreCase(String.valueOf(NpJson.trimmed(n, "Description"))))
                .map(n -> NpJson.trimmed(n, "Ref")).filter(Objects::nonNull).findFirst();
        if (exact.isPresent()) {
            return exact.get();
        }
        if (found.size() == 1 && NpJson.trimmed(found.get(0), "Ref") != null) {
            return NpJson.trimmed(found.get(0), "Ref");
        }
        throw NpErrors.bad("Улицу «" + typed.trim() + "» не нашли в справочнике Новой почты"
                + (found.isEmpty() ? "" : " однозначно") + " — выберите её в «Изменить доставку» и создайте ТТН снова");
    }

    private static JsonNode first(JsonNode data, String what) {
        if (data == null || !data.isArray() || data.isEmpty()) {
            throw NovaPoshtaException.rejected("Пустой ответ Новой почты на " + what);
        }
        return data.get(0);
    }
}
