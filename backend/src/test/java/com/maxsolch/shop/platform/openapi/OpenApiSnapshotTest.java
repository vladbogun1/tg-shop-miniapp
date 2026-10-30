package com.maxsolch.shop.platform.openapi;

import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The contract the front-ends are generated from: {@code /v3/api-docs} of the real controllers must equal
 * {@code src/test/resources/openapi/openapi.json}. A change of any DTO or endpoint fails here until the file is
 * rewritten on purpose ({@code -Dopenapi.update=true}) and {@code npm run gen:api} regenerates the TypeScript types.
 *
 * <p>The same run writes {@code openapi/error-codes.json} (the wire codes of every {@code ErrorCode} enum).
 */
class OpenApiSnapshotTest {

    private static final Path OPENAPI = Path.of("src/test/resources/openapi/openapi.json");
    private static final Path ERROR_CODES = Path.of("src/test/resources/openapi/error-codes.json");

    @Test
    void apiDocsEqualTheCommittedSnapshot() throws Exception {
        String actual = OpenApiDocs.render(OpenApiDocs.fetch());
        compareOrUpdate(OPENAPI, actual);
    }

    @Test
    void errorCodesEqualTheCommittedSnapshot() throws Exception {
        compareOrUpdate(ERROR_CODES, OpenApiDocs.render(OpenApiDocs.errorCodes()));
    }

    @Test
    void filterCodesAreStillSentByTheFilter() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/maxsolch/shop/platform/security/JwtAuthFilter.java"));
        for (String code : OpenApiDocs.FILTER_CODES) {
            assertThat(source).as("JwtAuthFilter sends " + code).contains("\"" + code + "\"");
        }
    }

    /**
     * A schema a response carries has no silently optional property: the front-ends lose the ability to catch a
     * vanished field if their types turn into {@code field?: T}. (Request-only schemas may leave fields out.)
     */
    @Test
    void responseSchemasHaveNoSilentlyOptionalProperty() throws Exception {
        JsonNode docs = OpenApiDocs.fetch();
        JsonNode schemas = docs.path("components").path("schemas");
        Set<String> inResponses = new TreeSet<>();
        for (JsonNode path : docs.path("paths")) {
            for (JsonNode operation : path) {
                collectRefs(operation.path("responses"), schemas, inResponses);
            }
        }
        assertThat(inResponses).as("response schemas").hasSizeGreaterThan(200);
        List<String> soft = new ArrayList<>();
        for (String name : inResponses) {
            JsonNode schema = schemas.path(name);
            TreeSet<String> required = new TreeSet<>();
            schema.path("required").forEach(n -> required.add(n.asText()));
            for (Iterator<String> p = schema.path("properties").fieldNames(); p.hasNext(); ) {
                String property = p.next();
                boolean allowed = OpenApiDocs.OPTIONAL_ON_PURPOSE.contains(name) || OpenApiDocs.OPTIONAL_ON_PURPOSE.contains(name + "." + property);
                if (!required.contains(property) && !allowed) {
                    soft.add(name + "." + property);
                }
            }
        }
        assertThat(soft).as("optional properties of response schemas (use @JsonInclude(NON_NULL) on purpose and list it in OPTIONAL_ON_PURPOSE)").isEmpty();
        assertThat(docs.toString()).doesNotContain("x-response");
    }

    private static void collectRefs(JsonNode node, JsonNode schemas, Set<String> out) {
        if (node.isObject()) {
            JsonNode ref = node.get("$ref");
            if (ref != null) {
                String name = ref.asText().substring(ref.asText().lastIndexOf('/') + 1);
                if (out.add(name)) {
                    collectRefs(schemas.path(name), schemas, out);
                }
            }
            node.fields().forEachRemaining(e -> collectRefs(e.getValue(), schemas, out));
        } else if (node.isArray()) {
            node.forEach(e -> collectRefs(e, schemas, out));
        }
    }

    private static void compareOrUpdate(Path file, String actual) throws IOException {
        if (Boolean.getBoolean("openapi.update") || !Files.exists(file)) {
            Files.createDirectories(file.getParent());
            Files.writeString(file, actual, StandardCharsets.UTF_8);
            return;
        }
        String expected = Files.readString(file, StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertThat(actual).as(file + " differs from the code; if the API change is intended run mvn test "
                + "-Dtest=OpenApiSnapshotTest -Dopenapi.update=true and then npm run gen:api").isEqualTo(expected);
    }
}
