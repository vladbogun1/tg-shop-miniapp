package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.JobStatus;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The structural check of an answer, not a judgement of its content (that is the admin's review): does the last
 * {@code ```json} block read, is there a block for every subject, is at least one field filled. The verdict is
 * what the admin sees at once: DONE (there is something to review), EMPTY (the model returned only empty fields)
 * or BAD_ANSWER (nothing to read). Keys that only name the subject ({@code id}, {@code sku}…) do not count as data.
 */
@Component
public class AiAnswerCheck {

    private static final Pattern JSON_BLOCK = Pattern.compile("```json\\s*([\\s\\S]*?)```");
    private static final List<String> WRAPPERS = List.of("products", "items", "results", "subjects");
    private static final Set<String> ID_KEYS = Set.of("id", "productid", "product_id", "subjectid", "subject_id",
            "sku", "slug");

    private final ObjectMapper mapper;

    public AiAnswerCheck(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** @param subjects how many objects the prompt was about (the answer must have a block for each) */
    public JobStatus check(String answer, int subjects) {
        JsonNode root = lastBlock(answer == null ? "" : answer);
        if (root == null) {
            return JobStatus.BAD_ANSWER;
        }
        List<JsonNode> blocks = subjectBlocks(root);
        if (blocks.size() < Math.max(1, subjects)) {
            return JobStatus.BAD_ANSWER;
        }
        return blocks.stream().anyMatch(AiAnswerCheck::filled) ? JobStatus.DONE : JobStatus.EMPTY;
    }

    private JsonNode lastBlock(String text) {
        Matcher m = JSON_BLOCK.matcher(text);
        String block = null;
        while (m.find()) {
            block = m.group(1);
        }
        if (block == null) {
            String t = text.trim();
            if (!t.startsWith("{") && !t.startsWith("[")) {
                return null;
            }
            block = t;
        }
        try {
            return mapper.readTree(block);
        } catch (Exception e) {
            return null;
        }
    }

    private static List<JsonNode> subjectBlocks(JsonNode root) {
        if (root.isObject()) {
            for (String key : WRAPPERS) {
                if (root.path(key).isArray()) {
                    return objects(root.path(key));
                }
            }
            return List.of(root);
        }
        return root.isArray() ? objects(root) : List.of();
    }

    private static List<JsonNode> objects(JsonNode array) {
        List<JsonNode> out = new ArrayList<>();
        array.forEach(n -> {
            if (n.isObject()) {
                out.add(n);
            }
        });
        return out;
    }

    /** At least one field other than the subject's name holds something. */
    private static boolean filled(JsonNode block) {
        Iterator<Map.Entry<String, JsonNode>> fields = block.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> f = fields.next();
            if (!ID_KEYS.contains(f.getKey().toLowerCase()) && hasValue(f.getValue())) {
                return true;
            }
        }
        return false;
    }

    private static boolean hasValue(JsonNode v) {
        if (v == null || v.isNull() || v.isMissingNode()) {
            return false;
        }
        if (v.isTextual()) {
            return !v.asText().isBlank();
        }
        if (v.isContainerNode()) {
            for (JsonNode child : v) {
                if (hasValue(child)) {
                    return true;
                }
            }
            return false;
        }
        return true;
    }
}
