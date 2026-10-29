package com.maxsolch.shop.procurement.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import com.maxsolch.shop.procurement.domain.NbuRates;
import com.maxsolch.shop.procurement.domain.ProcurementErrors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The official NBU rate for a date (public bank.gov.ua API, no key) over {@code platform.http}: 5 s to connect,
 * 8 s per request, no retries unless {@code app.http.clients.nbu.max-retries} says so (a GET, so safe to repeat).
 * Cached per currency and day in memory (a read-through cache, not a lock); any failure asks for a manual rate.
 */
@Slf4j
@Component
public class NbuRateClient implements NbuRates {

    static final String CLIENT_NAME = "nbu";
    private static final String URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=%s&date=%s&json";

    private final ResilientHttp http;
    private final ObjectMapper json;
    private final Map<String, BigDecimal> cache = new ConcurrentHashMap<>();

    public NbuRateClient(ObjectMapper json, HttpClients clients) {
        this.json = json;
        this.http = clients.create(HttpClientSettings.defaults(CLIENT_NAME)
                .withTimeouts(Duration.ofSeconds(5), Duration.ofSeconds(8)));
    }

    @Override
    public BigDecimal rate(String currency, LocalDate date) {
        if ("UAH".equals(currency)) {
            return BigDecimal.ONE;
        }
        String key = currency + "@" + date;
        BigDecimal cached = cache.get(key);
        if (cached != null) {
            return cached;
        }
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(String.format(URL, currency,
                    date.format(DateTimeFormatter.BASIC_ISO_DATE)))).GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode arr = res.statusCode() == 200 ? json.readTree(res.body()) : null;
            if (arr == null || !arr.isArray() || arr.isEmpty() || !arr.get(0).has("rate")) {
                throw new IllegalStateException("HTTP " + res.statusCode());
            }
            BigDecimal rate = arr.get(0).get("rate").decimalValue().setScale(4, java.math.RoundingMode.HALF_UP);
            cache.put(key, rate);
            return rate;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception e) {
            log.warn("NBU rate {} {} failed: {}", currency, date, e.toString());
            throw unavailable();
        }
    }

    private static RuntimeException unavailable() {
        return ProcurementErrors.badRequest("Курс НБУ сейчас не получить — введите вручную", "NBU_UNAVAILABLE");
    }
}
