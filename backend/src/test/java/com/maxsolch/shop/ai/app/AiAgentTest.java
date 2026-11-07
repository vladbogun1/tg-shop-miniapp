package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.ChatModel;
import com.maxsolch.shop.ai.domain.ChatModel.Block;
import com.maxsolch.shop.ai.domain.ChatModel.Reply;
import com.maxsolch.shop.ai.domain.ChatModel.Request;
import com.maxsolch.shop.ai.domain.ChatModel.Text;
import com.maxsolch.shop.ai.domain.ChatModel.ToolCall;
import com.maxsolch.shop.ai.domain.ChatModel.ToolResult;
import com.maxsolch.shop.ai.domain.SearchEngine.Hit;
import com.maxsolch.shop.ai.domain.TokenUsage;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The conversation of one question: tools, budget, forced answer, JSON repair, limit — with a scripted model. */
class AiAgentTest {

    private static final String JSON_PROMPT = "Заполни карточку. Ответ одним блоком ```json.";

    private final ScriptedModel model = new ScriptedModel();
    private final AiUsageLog usage = mock(AiUsageLog.class);
    private final WebSearch search = mock(WebSearch.class);
    private final WebPages pages = mock(WebPages.class);
    private final AiAgent agent = new AiAgent(model, usage, search, pages, new ObjectMapper(), Clock.systemUTC());

    @Test
    void plainQuestionIsOneCallWithoutTools() {
        model.answers(text("Привет"));

        AiAgent.Answer a = agent.ask(new AiAgent.Ask("supply", "Скажи привет", "low", 0));

        assertThat(a.text()).isEqualTo("Привет");
        assertThat(a.modelCalls()).isEqualTo(1);
        assertThat(model.requests.get(0).tools()).isEmpty();
    }

    @Test
    void researchRunsTheToolsAndHandsTheResultsBack() {
        when(search.search(eq("cards"), eq("viper specs"), anyInt()))
                .thenReturn(new WebSearch.Found(List.of(new Hit("Viper", "https://razer.com/v3", "54 g")), "serper", 1000));
        when(pages.open("cards", "https://razer.com/v3")).thenReturn("Weight 54 g");
        model.answers(tool("t1", "search", "query", "viper specs"), tool("t2", "open_page", "url", "https://razer.com/v3"),
                text("```json\n{\"weight\":54}\n```"));
        when(usage.model(anyString(), any(), anyLong(), any())).thenReturn(200L);

        AiAgent.Answer a = agent.ask(new AiAgent.Ask("cards", JSON_PROMPT, "medium", 1));

        assertThat(a.searches()).isEqualTo(1);
        assertThat(a.pages()).isEqualTo(1);
        assertThat(a.costMicroUsd()).isEqualTo(3 * 200 + 1000);
        assertThat(a.repaired()).isFalse();
        Request third = model.requests.get(2);
        assertThat(third.tools()).extracting(ChatModel.Tool::name).containsExactly("search", "open_page");
        assertThat(lastResult(third)).isEqualTo("Weight 54 g");
        assertThat(((Text) model.requests.get(0).messages().get(0).content().get(0)).text())
                .contains("Режим API").contains("до 3 поисков");
    }

    @Test
    void askingBeyondTheBudgetIsRefusedAndTheNextTurnMustAnswer() {
        when(search.search(anyString(), anyString(), anyInt())).thenReturn(new WebSearch.Found(List.of(), null, 0));
        List<Reply> script = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            script.add(tool("s" + i, "search", "query", "q" + i));
        }
        script.add(text("Не нашёл"));
        model.answers(script.toArray(Reply[]::new));

        agent.ask(new AiAgent.Ask("cards", "Найди", "low", 1));

        verify(search, times(3)).search(anyString(), anyString(), anyInt());
        assertThat(lastResult(model.requests.get(4))).contains("Лимит поисков исчерпан");
        assertThat(model.requests.get(3).toolsOff()).isFalse();
        assertThat(model.requests.get(4).toolsOff()).isTrue();
    }

    @Test
    void brokenJsonGetsOneRepairTurnWithoutTools() {
        model.answers(text("```json\n{\"weight\": 54,,}\n```"), text("```json\n{\"weight\":54}\n```"));

        AiAgent.Answer a = agent.ask(new AiAgent.Ask("cards", JSON_PROMPT, "medium", 0));

        assertThat(a.repaired()).isTrue();
        assertThat(a.text()).contains("{\"weight\":54}");
        Request fix = model.requests.get(1);
        assertThat(fix.tools()).isEmpty();
        assertThat(fix.effort()).isEqualTo("low");
        assertThat(((Text) fix.messages().get(2).content().get(0)).text()).startsWith("JSON не читается");
    }

    @Test
    void answerWithoutJsonIsFineWhenThePromptDidNotAskForIt() {
        model.answers(text("Просто текст"));

        assertThat(agent.ask(new AiAgent.Ask("supply", "Опиши", "low", 0)).repaired()).isFalse();
    }

    @Test
    void monthLimitStopsBeforeTheModelIsCalled() {
        doThrow(new DomainException.Conflict(AiError.MONTH_LIMIT, "10.00", "10.00")).when(usage).ensureWithinLimit();

        assertThatThrownBy(() -> agent.ask(new AiAgent.Ask("cards", "Q", "low", 0)))
                .isInstanceOf(DomainException.Conflict.class);
        assertThat(model.requests).isEmpty();
        verify(usage, never()).model(anyString(), any(), anyLong(), any());
    }

    @Test
    void noKeyMeansNotConfigured() {
        model.configured = false;

        assertThatThrownBy(() -> agent.ask(new AiAgent.Ask("cards", "Q", "low", 0)))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.errorCode()).isEqualTo(AiError.NOT_CONFIGURED));
    }

    @Test
    void jobRequestsAreValidatedBeforeAnyMoneyIsSpent() {
        assertThatThrownBy(() -> AiJobs.validate(new AiAgent.Ask("Cards!", "Q", "low", 0)))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> AiJobs.validate(new AiAgent.Ask("cards", "Q", "max", 0)))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> AiJobs.validate(new AiAgent.Ask("cards", "Q", "low", 11)))
                .isInstanceOf(DomainException.BadRequest.class);
        AiJobs.validate(new AiAgent.Ask("cards", "Q", "medium", 3));
    }

    private static String lastResult(Request r) {
        List<Block> last = r.messages().get(r.messages().size() - 1).content();
        return ((ToolResult) last.get(last.size() - 1)).content();
    }

    private static Reply text(String s) {
        return new Reply(List.of(new Text(s)), "end_turn", new TokenUsage(100, 0, 50));
    }

    private static Reply tool(String id, String name, String key, String value) {
        return new Reply(List.of(new ToolCall(id, name, Map.of(key, value))), "tool_use", new TokenUsage(100, 0, 50));
    }

    private static final class ScriptedModel implements ChatModel {
        final List<Request> requests = new ArrayList<>();
        final Deque<Reply> script = new ArrayDeque<>();
        boolean configured = true;

        void answers(Reply... replies) {
            script.addAll(List.of(replies));
        }

        public boolean configured() {
            return configured;
        }

        public String modelName() {
            return "test-model";
        }

        public Reply send(Request request) {
            requests.add(request);
            return script.isEmpty() ? new Reply(List.of(new Text("")), "end_turn", TokenUsage.NONE) : script.poll();
        }
    }
}
