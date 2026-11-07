package com.maxsolch.shop.ai.domain;

import java.util.List;
import java.util.Map;

/**
 * A chat model with tool use in the Anthropic Messages format (MiniMax speaks it). One {@link #send} is one HTTP call:
 * the tool loop, budgets and the monthly limit are the caller's ({@code AiAgent}).
 */
public interface ChatModel {

    /** False when the server has no key: every feature answers «AI not configured» instead of calling. */
    boolean configured();

    String modelName();

    /**
     * @throws com.maxsolch.shop.platform.error.DomainException.Unavailable with {@link AiError#MODEL_FAILED} when the
     *         model did not answer (HTTP error, timeout) — after the client's own bounded retry of 429/5xx
     */
    Reply send(Request request);

    /** One block of a message. {@link Other} keeps blocks we do not read (thinking) to send them back unchanged. */
    sealed interface Block permits Text, ToolCall, ToolResult, Other {
    }

    record Text(String text) implements Block {
    }

    record ToolCall(String id, String name, Map<String, Object> input) implements Block {

        public String arg(String key) {
            Object v = input == null ? null : input.get(key);
            return v == null ? "" : String.valueOf(v);
        }
    }

    record ToolResult(String toolCallId, String content) implements Block {
    }

    record Other(Map<String, Object> raw) implements Block {
    }

    record Message(String role, List<Block> content) {

        public static Message user(String text) {
            return new Message("user", List.of(new Text(text)));
        }

        public static Message assistant(List<Block> content) {
            return new Message("assistant", content);
        }
    }

    /** A tool the model may call: name, what it does, JSON schema of its input. */
    record Tool(String name, String description, Map<String, Object> inputSchema) {
    }

    /**
     * @param effort    low / medium / high — reasoning depth (MiniMax {@code output_config.effort})
     * @param toolsOff  tools stay declared (the history has tool calls) but the model must answer in text now
     */
    record Request(List<Message> messages, List<Tool> tools, boolean toolsOff, String effort, int maxTokens) {
    }

    record Reply(List<Block> content, String stopReason, TokenUsage tokens) {

        public String text() {
            StringBuilder sb = new StringBuilder();
            content.stream().filter(Text.class::isInstance).forEach(b -> sb.append(((Text) b).text()));
            return sb.toString();
        }

        public List<ToolCall> toolCalls() {
            return content.stream().filter(ToolCall.class::isInstance).map(ToolCall.class::cast).toList();
        }

        public boolean wantsTools() {
            return "tool_use".equals(stopReason) && !toolCalls().isEmpty();
        }
    }
}
