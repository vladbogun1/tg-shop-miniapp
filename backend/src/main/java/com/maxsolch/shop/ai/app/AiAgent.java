package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiScope;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.ChatModel;
import com.maxsolch.shop.ai.domain.ChatModel.Block;
import com.maxsolch.shop.ai.domain.ChatModel.Message;
import com.maxsolch.shop.ai.domain.ChatModel.Reply;
import com.maxsolch.shop.ai.domain.ChatModel.Request;
import com.maxsolch.shop.ai.domain.ChatModel.Text;
import com.maxsolch.shop.ai.domain.ChatModel.ToolCall;
import com.maxsolch.shop.ai.domain.ChatModel.ToolResult;
import com.maxsolch.shop.ai.domain.TokenUsage;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * One question to the AI, the way the admin used to paste a prompt into ChatGPT: the prompt is built by the admin
 * (the same builders as for copying), the answer goes back to the same parsers. Here — only the conversation:
 * <ol>
 *   <li>with research on, the model gets the tools «search» / «open_page» and a budget per item; when both budgets
 *       are spent (or turns run out) the next call is made with tools off — the model must answer;</li>
 *   <li>when the prompt asks for a {@code ```json} block and the answer has none that parses — one repair turn without
 *       tools (the model gets the parse error and sends the block again);</li>
 *   <li>the gate (cancel, switch, limits, ceiling) is asked before every model call; every call is a line in {@code ai_usage}.</li>
 * </ol>
 */
@Service
public class AiAgent {

    static final int MAX_TURNS = 24;
    static final int MAX_TOKENS = 64_000;
    private static final Pattern JSON_BLOCK = Pattern.compile("```json\\s*([\\s\\S]*?)```");

    /**
     * @param researchItems how many products the prompt is about (scales the search budget); 0 = no tools
     */
    public record Ask(AiScope scope, String prompt, String effort, int researchItems, Gate gate) {

        public Ask(AiScope scope, String prompt, String effort, int researchItems) {
            this(scope, prompt, effort, researchItems, Gate.OPEN);
        }
    }

    /** Asked before every model turn: throws to stop the run (canceled, switched off, over a limit or a deadline). */
    @FunctionalInterface
    public interface Gate {
        Gate OPEN = () -> {
        };

        void beforeTurn();
    }

    public record Answer(String text, String model, long costMicroUsd, TokenUsage tokens, int modelCalls, int searches,
                         int pages, boolean repaired, long ms) {
    }

    private final ChatModel model;
    private final AiUsageLog usage;
    private final WebSearch search;
    private final WebPages pages;
    private final ObjectMapper mapper;
    private final Clock clock;

    public AiAgent(ChatModel model, AiUsageLog usage, WebSearch search, WebPages pages, ObjectMapper mapper,
                   Clock clock) {
        this.model = model;
        this.usage = usage;
        this.search = search;
        this.pages = pages;
        this.mapper = mapper;
        this.clock = clock;
    }

    public boolean configured() {
        return model.configured();
    }

    public Answer ask(Ask ask) {
        if (!model.configured()) {
            throw new DomainException.Unavailable(AiError.NOT_CONFIGURED);
        }
        long t0 = clock.millis();
        Run run = new Run(ask);
        String text = ask.researchItems() > 0 ? research(run) : run.call(List.of(Message.user(ask.prompt())), false)
                .text();
        boolean repaired = false;
        String broken = ask.prompt().contains("```json") ? jsonProblem(text) : null;
        if (broken != null) {
            List<Message> fix = List.of(Message.user(ask.prompt()),
                    Message.assistant(List.of(new Text(text.isBlank() ? "(пусто)" : text))),
                    Message.user("JSON не читается: " + broken + ". Больше ничего не ищи — пришли исправленный ответ "
                            + "целиком одним блоком ```json."));
            text = run.repair(fix).text();
            repaired = true;
        }
        ResearchTools tools = run.tools;
        return new Answer(text, model.modelName(), run.cost + (tools == null ? 0 : tools.costMicroUsd()), run.tokens,
                run.calls, tools == null ? 0 : tools.searches(), tools == null ? 0 : tools.pages(), repaired,
                clock.millis() - t0);
    }

    private String research(Run run) {
        List<Message> convo = new ArrayList<>();
        convo.add(Message.user(run.ask.prompt() + run.tools.rules()));
        boolean force = false;
        for (int turn = 0; turn < MAX_TURNS; turn++) {
            Reply r = run.call(convo, force || turn == MAX_TURNS - 1);
            if (!r.wantsTools()) {
                return r.text();
            }
            convo.add(Message.assistant(r.content()));
            List<Block> results = new ArrayList<>();
            for (ToolCall c : r.toolCalls()) {
                results.add(new ToolResult(c.id(), run.tools.run(c)));
            }
            convo.add(new Message("user", results));
            force = run.tools.exhausted();
        }
        return "";
    }

    /** Null when the last {@code ```json} block (or the whole answer) parses; otherwise the parser's complaint. */
    String jsonProblem(String text) {
        Matcher m = JSON_BLOCK.matcher(text);
        String block = null;
        while (m.find()) {
            block = m.group(1);
        }
        if (block == null) {
            String t = text.trim();
            if (!t.startsWith("{") && !t.startsWith("[")) {
                return "в ответе нет блока ```json";
            }
            block = t;
        }
        try {
            mapper.readTree(block);
            return null;
        } catch (Exception e) {
            String msg = String.valueOf(e.getMessage()).split("\n")[0];
            return msg.length() > 300 ? msg.substring(0, 300) : msg;
        }
    }

    /** The state of one {@link #ask}: tokens and money so far, the research tools with their budget. */
    private final class Run {
        final Ask ask;
        final ResearchTools tools;
        TokenUsage tokens = TokenUsage.NONE;
        long cost;
        int calls;

        Run(Ask ask) {
            this.ask = ask;
            this.tools = ask.researchItems() > 0 ? new ResearchTools(ask.scope(), ask.researchItems(), search, pages)
                    : null;
        }

        Reply call(List<Message> messages, boolean toolsOff) {
            return send(new Request(messages, tools == null ? List.of() : ResearchTools.DEFS, toolsOff, ask.effort(),
                    MAX_TOKENS));
        }

        Reply repair(List<Message> messages) {
            return send(new Request(messages, List.of(), true, "low", MAX_TOKENS));
        }

        private Reply send(Request request) {
            ask.gate().beforeTurn();
            long t0 = clock.millis();
            try {
                Reply r = model.send(request);
                calls++;
                tokens = tokens.plus(r.tokens());
                cost += usage.model(ask.scope(), r.tokens(), clock.millis() - t0, null);
                return r;
            } catch (DomainException e) {
                usage.model(ask.scope(), TokenUsage.NONE, clock.millis() - t0, java.util.Arrays.toString(e.args()));
                throw e;
            }
        }
    }
}
