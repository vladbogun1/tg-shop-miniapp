package com.maxsolch.shop.translation.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.HttpClientsProperties;
import com.maxsolch.shop.translation.domain.MachineTranslationException;
import com.maxsolch.shop.translation.domain.MachineTranslator;
import com.maxsolch.shop.translation.domain.TranslationGlossary;
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
    /** Answer of GET /v3/glossaries; POST creates {@code g-new}. */
    private volatile String glossaries = "{\"glossaries\":[]}";

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            requests.add(ex.getRequestMethod() + " " + ex.getRequestURI() + " auth="
                    + ex.getRequestHeaders().getFirst("Authorization") + " body=" + body);
            String path = ex.getRequestURI().getPath();
            String reply = !path.startsWith("/v3/") ? answer
                    : "GET".equals(ex.getRequestMethod()) ? glossaries
                    : "POST".equals(ex.getRequestMethod()) ? "{\"glossary_id\":\"g-new\"}" : "";
            byte[] out = reply.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            int code = !path.startsWith("/v3/") ? status : "DELETE".equals(ex.getRequestMethod()) ? 204 : 200;
            ex.sendResponseHeaders(code, out.length == 0 ? -1 : out.length);
            if (out.length > 0) {
                ex.getResponseBody().write(out);
            }
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
        String translate = only("POST /v2/translate");
        assertThat(translate).startsWith("POST /v2/translate auth=DeepL-Auth-Key k-1:fx");
        JsonNode body = body(translate);
        assertThat(body.path("source_lang").asText()).isEqualTo("RU");
        assertThat(body.path("target_lang").asText()).isEqualTo("UK");
        assertThat(body.path("context").asText()).isEqualTo("глоссарий");
        assertThat(body.path("glossary_id").asText()).isEqualTo("g-new");
        assertThat(body.has("tag_handling")).isFalse();
    }

    @Test
    void placeholdersGoAsPlainTextAndEnglishNumbersAreUngrouped() throws Exception {
        answer = "{\"translations\":[{\"text\":\"Hello, {name}: 8,000 Hz, 18,000 DPI\"}]}";

        List<String> out = client().translate(List.of("Привет, {name}: 8000 Гц, 18000 DPI"), "en", null);

        assertThat(out).containsExactly("Hello, {name}: 8000 Hz, 18000 DPI");
        JsonNode body = body(only("POST /v2/translate"));
        assertThat(body.path("target_lang").asText()).isEqualTo("EN-US");
        assertThat(body.has("tag_handling")).isFalse();
        assertThat(body.path("text").get(0).asText()).isEqualTo("Привет, {name}: 8000 Гц, 18000 DPI");
    }

    @Test
    void glossaryIsCreatedOnceWithBothPairsAndOldOnesAreDeleted() throws Exception {
        glossaries = "{\"glossaries\":[{\"glossary_id\":\"g-old\",\"name\":\"chisetup-000000000000\"},"
                + "{\"glossary_id\":\"g-mine\",\"name\":\"someone-else\"}]}";
        answer = "{\"translations\":[{\"text\":\"Mouse pad\"}]}";
        DeepLTranslator client = client();

        client.translate(List.of("Коврик"), "en", null);
        client.translate(List.of("Коврик"), "uk", null);

        assertThat(requests).filteredOn(r -> r.startsWith("GET /v3/glossaries")).hasSize(1);
        assertThat(requests).anyMatch(r -> r.startsWith("DELETE /v3/glossaries/g-old"));
        assertThat(requests).noneMatch(r -> r.startsWith("DELETE /v3/glossaries/g-mine"));
        JsonNode created = body(only("POST /v3/glossaries"));
        assertThat(created.path("name").asText()).startsWith("chisetup-");
        assertThat(created.path("dictionaries")).extracting(d -> d.path("target_lang").asText())
                .containsExactly("uk", "en");
        assertThat(created.path("dictionaries").get(1).path("entries").asText()).contains("коврик	mouse pad");
    }

    @Test
    void anExistingGlossaryIsReused() throws Exception {
        String name = DeepLGlossary.name(DeepLGlossary.dictionaries(TranslationGlossary.TERMS));
        glossaries = "{\"glossaries\":[{\"glossary_id\":\"g-1\",\"name\":\"" + name + "\"}]}";
        answer = "{\"translations\":[{\"text\":\"Mouse pad\"}]}";

        client().translate(List.of("Коврик"), "en", null);

        assertThat(requests).noneMatch(r -> r.startsWith("POST /v3/") || r.startsWith("DELETE"));
        assertThat(body(only("POST /v2/translate")).path("glossary_id").asText()).isEqualTo("g-1");
    }

    private String only(String prefix) {
        List<String> found = requests.stream().filter(r -> r.startsWith(prefix)).toList();
        assertThat(found).as(prefix).hasSize(1);
        return found.get(0);
    }

    private static JsonNode body(String request) throws IOException {
        return JSON.readTree(request.substring(request.indexOf("body=") + 5));
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
