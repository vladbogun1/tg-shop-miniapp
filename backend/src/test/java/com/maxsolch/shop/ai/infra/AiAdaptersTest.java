package com.maxsolch.shop.ai.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.ChatModel;
import com.maxsolch.shop.ai.domain.ChatModel.Message;
import com.maxsolch.shop.ai.domain.ChatModel.Other;
import com.maxsolch.shop.ai.domain.ChatModel.Reply;
import com.maxsolch.shop.ai.domain.ChatModel.ToolCall;
import com.maxsolch.shop.ai.domain.SearchEngine;
import com.maxsolch.shop.ai.domain.TokenUsage;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.HttpClientsProperties;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** What the AI adapters read from and write to the outside services — without the network. */
class AiAdaptersTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode json(String s) throws Exception {
        return mapper.readTree(s);
    }

    @Test
    void searxngResultsBecomeHits() throws Exception {
        SearchEngine.Outcome out = SearxngSearch.parse(json("""
                {"results":[{"title":"Viper V3 Pro","url":"https://razer.com/v3","content":"54 g"},
                            {"title":"no url"},
                            {"title":"Review","url":"https://rtings.com/x","content":"sensor"}],
                 "unresponsive_engines":[["google","too many requests"]]}"""), 5);

        assertThat(out.failed()).isFalse();
        assertThat(out.hits()).extracting(SearchEngine.Hit::url).containsExactly("https://razer.com/v3", "https://rtings.com/x");
    }

    @Test
    void searxngWithEveryEngineDownIsAFailureNotAnEmptyAnswer() throws Exception {
        SearchEngine.Outcome out = SearxngSearch.parse(json("""
                {"results":[],"unresponsive_engines":[["google","Suspended: too many requests"]]}"""), 5);

        assertThat(out.failed()).isTrue();
        assertThat(out.reason()).contains("engines down");
    }

    @Test
    void searxngHonestNothingIsEmptyNotFailure() throws Exception {
        SearchEngine.Outcome out = SearxngSearch.parse(json("{\"results\":[],\"unresponsive_engines\":[]}"), 5);

        assertThat(out.failed()).isFalse();
        assertThat(out.hits()).isEmpty();
    }

    @Test
    void readerWarningAboutA404IsNoPage() {
        assertThat(JinaReader.targetFailed("Title: \nURL Source: https://x.com/a\nWarning: Target URL returned error 404: Not Found\n"))
                .isTrue();
        assertThat(JinaReader.targetFailed("Title: Viper\nMarkdown Content:\nWeight 54 g")).isFalse();
    }

    @Test
    void serperOrganicResultsAreReadUpToTheLimit() throws Exception {
        List<SearchEngine.Hit> hits = SerperSearch.parse(json("""
                {"organic":[{"title":"A","link":"https://a.com","snippet":"x"},
                            {"title":"B","link":"https://b.com","snippet":"y"},
                            {"title":"C","link":"https://c.com"}]}"""), 2);

        assertThat(hits).extracting(SearchEngine.Hit::title).containsExactly("A", "B");
    }

    @Test
    void minimaxReplyKeepsThinkingForTheNextTurnAndCountsCachedTokensApart() throws Exception {
        Reply r = MiniMaxChat.parse(json("""
                {"stop_reason":"tool_use",
                 "content":[{"type":"thinking","thinking":"let me search","signature":"s1"},
                            {"type":"text","text":"Ищу"},
                            {"type":"tool_use","id":"t1","name":"search","input":{"query":"viper v3 pro"}}],
                 "usage":{"input_tokens":1200,"cache_read_input_tokens":800,"output_tokens":300}}"""), mapper);

        assertThat(r.wantsTools()).isTrue();
        assertThat(r.text()).isEqualTo("Ищу");
        assertThat(r.toolCalls()).singleElement().satisfies(c -> assertThat(c.arg("query")).isEqualTo("viper v3 pro"));
        assertThat(r.content().get(0)).isInstanceOf(Other.class);
        assertThat(r.tokens()).isEqualTo(new TokenUsage(1200, 800, 300));
    }

    @Test
    void requestWithToolsOffStillDeclaresToolsButForbidsCallingThem() {
        MiniMaxChat chat = new MiniMaxChat(new AiProperties(), mapper, new HttpClients(new HttpClientsProperties()));
        ChatModel.Tool tool = new ChatModel.Tool("search", "find", Map.of("type", "object"));
        Message assistant = Message.assistant(List.of(new Other(Map.of("type", "thinking", "signature", "s1")),
                new ToolCall("t1", "search", Map.of("query", "q"))));

        JsonNode body = chat.body(new ChatModel.Request(List.of(Message.user("hi"), assistant), List.of(tool), true,
                "medium", 1000));

        assertThat(body.path("tool_choice").path("type").asText()).isEqualTo("none");
        assertThat(body.path("output_config").path("effort").asText()).isEqualTo("medium");
        assertThat(body.path("tools").get(0).path("input_schema").path("type").asText()).isEqualTo("object");
        JsonNode blocks = body.path("messages").get(1).path("content");
        assertThat(blocks.get(0).path("signature").asText()).isEqualTo("s1");
        assertThat(blocks.get(1).path("type").asText()).isEqualTo("tool_use");
        assertThat(blocks.get(1).path("input").path("query").asText()).isEqualTo("q");
    }
}
