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

    /**
     * Every property of every schema is either required or nullable-by-annotation, never silently optional:
     * the front-ends lose the ability to catch a vanished field if the types turn into {@code field?: T}.
     */
    @Test
    void noSchemaPropertyIsSilentlyOptional() throws Exception {
        JsonNode docs = OpenApiDocs.fetch();
        List<String> soft = new ArrayList<>();
        for (Iterator<Map.Entry<String, JsonNode>> it = docs.path("components").path("schemas").fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> schema = it.next();
            JsonNode props = schema.getValue().path("properties");
            TreeSet<String> required = new TreeSet<>();
            schema.getValue().path("required").forEach(n -> required.add(n.asText()));
            for (Iterator<String> p = props.fieldNames(); p.hasNext(); ) {
                String name = p.next();
                boolean allowed = OpenApiDocs.OPTIONAL_ON_PURPOSE.contains(schema.getKey()) || OpenApiDocs.OPTIONAL_ON_PURPOSE.contains(schema.getKey() + "." + name);
                if (!required.contains(name) && !allowed) {
                    soft.add(schema.getKey() + "." + name);
                }
            }
        }
        assertThat(soft).as("optional properties (mark the record component @JsonInclude(NON_NULL) on purpose)").isEmpty();
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
