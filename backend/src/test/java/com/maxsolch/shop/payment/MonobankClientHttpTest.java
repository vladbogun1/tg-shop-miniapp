package com.maxsolch.shop.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.platform.config.AppProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The monobank client against a local server: what goes on the wire (token, body, path), how an error answer
 * becomes a {@link MonobankClient.MonobankException}, and that a POST (invoice, refund) is never sent twice.
 */
class MonobankClientHttpTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private HttpServer server;
    private final AtomicInteger hits = new AtomicInteger();
    private final List<String> requests = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String answer = "{}";

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            hits.incrementAndGet();
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            requests.add(ex.getRequestMethod() + " " + ex.getRequestURI() + " token=" + ex.getRequestHeaders().getFirst("X-Token")
                    + " cms=" + ex.getRequestHeaders().getFirst("X-Cms") + " body=" + body);
            byte[] out = answer.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(status, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private MonobankClient client(String token) {
        AppProperties props = new AppProperties();
        props.getPayment().getMonobank().setToken(token);
        props.getPayment().getMonobank().setApiUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/");
        return newClient(props);
    }

    /** One place that builds the client, so the construction can change without touching the cases. */
    private static MonobankClient newClient(AppProperties props) {
        return new MonobankClient(props, JSON);
    }

    @Test
    void createInvoiceSendsTokenAndTheAmountAndReadsTheIds() throws Exception {
        answer = "{\"invoiceId\":\"inv-1\",\"pageUrl\":\"https://pay.example/inv-1\"}";

        MonobankClient.CreatedInvoice created = client("t-1").createInvoice(new MonobankClient.CreateInvoice(
                12_300, "order-ref", "Оплата", List.of(new MonobankClient.BasketItem("Mouse", 1, 12_300, "sku-1")),
                "https://site/return", "https://site/hook", 3600, true));

        assertThat(created.invoiceId()).isEqualTo("inv-1");
        assertThat(created.pageUrl()).isEqualTo("https://pay.example/inv-1");
        String sent = requests.get(0);
        assertThat(sent).startsWith("POST /api/merchant/invoice/create token=t-1 cms=chisetup body=");
        JsonNode body = JSON.readTree(sent.substring(sent.indexOf("body=") + 5));
        assertThat(body.path("amount").asLong()).isEqualTo(12_300);
        assertThat(body.path("ccy").asInt()).isEqualTo(980);
        assertThat(body.path("displayType").asText()).isEqualTo("iframe");
        assertThat(body.path("merchantPaymInfo").path("basketOrder").get(0).path("total").asLong()).isEqualTo(12_300);
    }

    @Test
    void statusIsAGetWithTheEncodedInvoiceId() {
        answer = "{\"invoiceId\":\"a b\",\"status\":\"success\",\"amount\":100,\"ccy\":980}";

        MonobankInvoiceStatus st = client("t").status("a b");

        assertThat(st.status()).isEqualTo("success");
        assertThat(requests.get(0)).startsWith("GET /api/merchant/invoice/status?invoiceId=a+b ");
    }

    @Test
    void errorAnswerCarriesTheBanksCodeAndText() {
        status = 400;
        answer = "{\"errCode\":\"BAD_AMOUNT\",\"errText\":\"amount is wrong\"}";

        assertThatThrownBy(() -> client("t").cancel("inv-1", "ref", 5L))
                .isInstanceOfSatisfying(MonobankClient.MonobankException.class, e -> {
                    assertThat(e.getErrCode()).isEqualTo("BAD_AMOUNT");
                    assertThat(e.getMessage()).isEqualTo("monobank 400 BAD_AMOUNT: amount is wrong");
                });
    }

    @Test
    void aPostThatFailedWithAServerErrorIsNotRepeated() {
        status = 503;
        answer = "{}";

        assertThatThrownBy(() -> client("t").remove("inv-1")).isInstanceOf(MonobankClient.MonobankException.class);

        assertThat(hits.get()).isEqualTo(1);
    }

    @Test
    void withoutATokenNothingIsSent() {
        assertThatThrownBy(() -> client("").details())
                .isInstanceOf(MonobankClient.MonobankException.class)
                .hasMessageContaining("DISABLED");

        assertThat(hits.get()).isZero();
    }

    @Test
    void anUnreachableServerIsAnIoException() {
        int port = server.getAddress().getPort();
        server.stop(0);
        AppProperties props = new AppProperties();
        props.getPayment().getMonobank().setToken("t");
        props.getPayment().getMonobank().setApiUrl("http://127.0.0.1:" + port);

        assertThatThrownBy(() -> newClient(props).pubkey())
                .isInstanceOf(MonobankClient.MonobankException.class)
                .hasMessageContaining("IO");
    }
}
