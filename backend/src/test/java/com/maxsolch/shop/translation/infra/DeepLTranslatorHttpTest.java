package com.maxsolch.shop.translation.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.HttpClientsProperties;
import com.maxsolch.shop.translation.domain.MachineTranslationException;
import com.maxsolch.shop.translation.domain.MachineTranslator;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The DeepL client against a local server: what goes on the wire and how answers and errors are read. */
class DeepLTranslatorHttpTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private HttpServer server;
    private final List<String> requests = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String answer = "{}";

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            requests.add(ex.getRequestMethod() + " " + ex.getRequestURI() + " auth="
                    + ex.getRequestHeaders().getFirst("Authorization") + " body=" + body);
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

    private DeepLTranslator client() {
        DeepLProperties props = new DeepLProperties();
        props.setApiKey("k-1:fx");
        props.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        return new DeepLTranslator(props, JSON, new HttpClients(new HttpClientsProperties()));
    }

    @Test
    void translateSendsKeyLanguagesAndContextAndReadsInOrder() throws Exception {
        answer = "{\"translations\":[{\"text\":\"Мишка\"},{\"text\":\"Килимок\"}]}";

        List<String> out = client().translate(List.of("Мышь", "Коврик"), "uk", "глоссарий");

        assertThat(out).containsExactly("Мишка", "Килимок");
        assertThat(requests).singleElement().asString()
                .startsWith("POST /v2/translate auth=DeepL-Auth-Key k-1:fx");
        JsonNode body = JSON.readTree(requests.get(0).substring(requests.get(0).indexOf("body=") + 5));
        assertThat(body.path("source_lang").asText()).isEqualTo("RU");
        assertThat(body.path("target_lang").asText()).isEqualTo("UK");
        assertThat(body.path("context").asText()).isEqualTo("глоссарий");
        assertThat(body.has("tag_handling")).isFalse();
    }

    @Test
    void englishIsAmericanAndPlaceholdersGoThroughXml() throws Exception {
        answer = "{\"translations\":[{\"text\":\"Hello, <x>{name}</x> &amp; friends\"}]}";

        List<String> out = client().translate(List.of("Привет, {name} & друзья"), "en", null);

        assertThat(out).containsExactly("Hello, {name} & friends");
        JsonNode body = JSON.readTree(requests.get(0).substring(requests.get(0).indexOf("body=") + 5));
        assertThat(body.path("target_lang").asText()).isEqualTo("EN-US");
        assertThat(body.path("tag_handling").asText()).isEqualTo("xml");
        assertThat(body.path("text").get(0).asText()).isEqualTo("Привет, <x>{name}</x> &amp; друзья");
    }

    @Test
    void usageIsRead() throws Exception {
        answer = "{\"character_count\":1234,\"character_limit\":500000}";

        MachineTranslator.Usage u = client().usage();

        assertThat(u.remaining()).isEqualTo(498_766);
        assertThat(requests).singleElement().asString().startsWith("GET /v2/usage");
    }

    @Test
    void errorsBecomeKinds() {
        status = 456;
        assertThatThrownBy(() -> client().translate(List.of("Мышь"), "uk", null))
                .isInstanceOfSatisfying(MachineTranslationException.class,
                        e -> assertThat(e.kind()).isEqualTo(MachineTranslationException.Kind.QUOTA));
        status = 403;
        assertThatThrownBy(() -> client().usage())
                .isInstanceOfSatisfying(MachineTranslationException.class,
                        e -> assertThat(e.kind()).isEqualTo(MachineTranslationException.Kind.AUTH));
    }

    @Test
    void wrongNumberOfTranslationsIsABadAnswer() {
        answer = "{\"translations\":[{\"text\":\"Мишка\"}]}";

        assertThatThrownBy(() -> client().translate(List.of("Мышь", "Коврик"), "uk", null))
                .isInstanceOfSatisfying(MachineTranslationException.class,
                        e -> assertThat(e.kind()).isEqualTo(MachineTranslationException.Kind.BAD_ANSWER));
    }

    @Test
    void freeKeyGoesToTheFreeHost() {
        DeepLProperties props = new DeepLProperties();
        props.setApiKey("abc:fx");
        assertThat(props.effectiveBaseUrl()).isEqualTo("https://api-free.deepl.com");
        props.setApiKey("abc");
        assertThat(props.effectiveBaseUrl()).isEqualTo("https://api.deepl.com");
    }
}
