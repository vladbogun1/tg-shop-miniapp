package com.maxsolch.shop.ai.infra;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.ChatModel;
import com.maxsolch.shop.ai.domain.TokenUsage;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * MiniMax through its Anthropic-compatible endpoint ({@code POST /v1/messages}).
 *
 * <p>5 s to connect, 180 s for the answer (one turn of research with thinking takes up to a minute). Repeating is safe
 * — the call changes nothing anywhere, it only costs tokens — so an I/O error or 502–504 is repeated once by
 * {@link ResilientHttp}, and «overloaded» (429, 529) once more here after 3 s. Then the caller gets
 * {@link AiError#MODEL_FAILED}.
 */
@Component
public class MiniMaxChat implements ChatModel {

    private static final HttpClientSettings HTTP = HttpClientSettings.defaults("ai-minimax")
            .withTimeouts(Duration.ofSeconds(5), Duration.ofSeconds(180))
            .withRetries(1, Duration.ofSeconds(2));
    private static final long OVERLOAD_PAUSE_MS = 3000;
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {
    };

    private final ResilientHttp http;
    private final ObjectMapper mapper;
    private final AiProperties.Model props;

    public MiniMaxChat(AiProperties props, ObjectMapper mapper, HttpClients clients) {
        this.http = clients.create(HTTP);
        this.mapper = mapper;
        this.props = props.getModel();
    }

    @Override
    public boolean configured() {
        return props.getApiKey() != null && !props.getApiKey().isBlank();
    }

    @Override
    public String modelName() {
        return props.getName();
    }

    @Override
    public Reply send(Request request) {
        String body = body(request).toString();
        try {
            HttpResponse<String> res = post(body);
            if (res.statusCode() == 429 || res.statusCode() == 529) {
                Thread.sleep(OVERLOAD_PAUSE_MS);
                res = post(body);
            }
            if (res.statusCode() != 200) {
                throw failed("HTTP " + res.statusCode() + " " + shorten(res.body()));
            }
            return parse(mapper.readTree(res.body()), mapper);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw failed("interrupted");
        } catch (IOException e) {
            throw failed(e.getClass().getSimpleName());
        }
    }

    private HttpResponse<String> post(String body) throws IOException, InterruptedException {
        HttpRequest req = HttpRequest.newBuilder(URI.create(props.getBaseUrl().replaceAll("/+$", "") + "/v1/messages"))
                .header("content-type", "application/json")
                .header("x-api-key", props.getApiKey())
                .header("anthropic-version", "2023-06-01")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        return http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8), true);
    }

    ObjectNode body(Request request) {
        ObjectNode root = mapper.createObjectNode();
        root.put("model", props.getName());
        root.put("max_tokens", request.maxTokens());
        root.putObject("output_config").put("effort", request.effort());
        ArrayNode messages = root.putArray("messages");
        for (Message m : request.messages()) {
            ObjectNode msg = messages.addObject();
            msg.put("role", m.role());
            ArrayNode content = msg.putArray("content");
            m.content().forEach(b -> content.add(block(b)));
        }
        if (!request.tools().isEmpty()) {
            ArrayNode tools = root.putArray("tools");
            for (Tool t : request.tools()) {
                ObjectNode tool = tools.addObject();
                tool.put("name", t.name());
                tool.put("description", t.description());
                tool.set("input_schema", mapper.valueToTree(t.inputSchema()));
            }
            if (request.toolsOff()) {
                root.putObject("tool_choice").put("type", "none");
            }
        }
        return root;
    }

    private JsonNode block(Block b) {
        ObjectNode n = mapper.createObjectNode();
        switch (b) {
            case Text t -> n.put("type", "text").put("text", t.text());
            case ToolCall c -> {
                n.put("type", "tool_use").put("id", c.id()).put("name", c.name());
                n.set("input", mapper.valueToTree(c.input() == null ? Map.of() : c.input()));
            }
            case ToolResult r -> n.put("type", "tool_result").put("tool_use_id", r.toolCallId()).put("content", r.content());
            case Other o -> {
                return mapper.valueToTree(o.raw());
            }
        }
        return n;
    }

    static Reply parse(JsonNode res, ObjectMapper mapper) {
        List<Block> content = new ArrayList<>();
        for (JsonNode b : res.path("content")) {
            String type = b.path("type").asText("");
            switch (type) {
                case "text" -> content.add(new Text(b.path("text").asText("")));
                case "tool_use" -> content.add(new ToolCall(b.path("id").asText(), b.path("name").asText(),
                        mapper.convertValue(b.path("input"), MAP)));
                default -> content.add(new Other(mapper.convertValue(b, MAP)));
            }
        }
        JsonNode u = res.path("usage");
        TokenUsage tokens = new TokenUsage(u.path("input_tokens").asInt(0), u.path("cache_read_input_tokens").asInt(0),
                u.path("output_tokens").asInt(0));
        return new Reply(content, res.path("stop_reason").asText(""), tokens);
    }

    private static DomainException failed(String why) {
        return new DomainException.Unavailable(AiError.MODEL_FAILED, why);
    }

    private static String shorten(String s) {
        String one = s == null ? "" : s.replaceAll("\\s+", " ");
        return one.length() > 200 ? one.substring(0, 200) : one;
    }
}
