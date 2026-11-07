package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiScope;
import com.maxsolch.shop.ai.domain.AiUsage;
import com.maxsolch.shop.ai.domain.SearchEngine;
import com.maxsolch.shop.ai.domain.SearchEngine.Hit;
import com.maxsolch.shop.ai.domain.SearchEngine.Outcome;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.junit.jupiter.api.Test;
import com.maxsolch.shop.ai.infra.AiSearchPaceStore;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/** The chain SearXNG → Serper: order, fallback on empty and on failure, the 10-minute rest, the journal. */
class WebSearchTest {

    private final AiUsageLog usage = mock(AiUsageLog.class);
    private final MemoryStore store = new MemoryStore();
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-07T10:00:00Z"), ZoneOffset.UTC);
    private final AiPolicy policy = mock(AiPolicy.class);
    private final DomainEvents events = mock(DomainEvents.class);

    WebSearchTest() {
        org.mockito.Mockito.when(policy.searchProviderAllowed(any())).thenReturn(true);
    }

    private static final Hit RAZER = new Hit("Viper", "https://razer.com/v3", "54 g");
    private static final Hit OURS = new Hit("Наш магазин", "https://chisetup.com.ua/p/viper", "");

    @Test
    void firstProviderWithResultsAnswersAndTheNextIsNotAsked() {
        Engine free = new Engine("searxng", 10, 0, Outcome.found(List.of(RAZER)));
        Engine paid = new Engine("serper", 20, 1000, Outcome.found(List.of(RAZER)));

        WebSearch.Found found = chain(paid, free).search(AiScope.of(AiFeature.CARD), "viper v3 pro", 8);

        assertThat(found.provider()).isEqualTo("searxng");
        assertThat(found.costMicroUsd()).isZero();
        assertThat(paid.asked).isZero();
    }

    @Test
    void emptyAnswerGoesToTheNextProviderAndBothAreJournalled() {
        Engine free = new Engine("searxng", 10, 0, Outcome.found(List.of(OURS)));
        Engine paid = new Engine("serper", 20, 1000, Outcome.found(List.of(RAZER)));

        WebSearch.Found found = chain(free, paid).search(AiScope.of(AiFeature.CARD), "viper", 8);

        assertThat(found.hits()).containsExactly(RAZER);
        assertThat(found.costMicroUsd()).isEqualTo(1000);
        verify(usage).call(eq(AiScope.of(AiFeature.CARD)), eq(AiUsage.Kind.SEARCH), eq("searxng"), eq(AiUsage.Result.EMPTY), eq(0L),
                anyLong(), any());
        verify(usage).call(eq(AiScope.of(AiFeature.CARD)), eq(AiUsage.Kind.SEARCH), eq("serper"), eq(AiUsage.Result.OK), eq(1000L),
                anyLong(), any());
    }

    @Test
    void failedProviderRestsSoTheNextQueriesSkipIt() {
        Engine free = new Engine("searxng", 10, 0, Outcome.failure("engines down"), Outcome.found(List.of(RAZER)));
        Engine paid = new Engine("serper", 20, 1000, Outcome.found(List.of(RAZER)), Outcome.found(List.of(RAZER)));
        WebSearch search = chain(free, paid);

        search.search(AiScope.of(AiFeature.CARD), "q1", 8);
        WebSearch.Found second = search.search(AiScope.of(AiFeature.CARD), "q2", 8);

        assertThat(free.asked).isEqualTo(1);
        assertThat(second.provider()).isEqualTo("serper");
        assertThat(search.providers()).contains(new WebSearch.ProviderState("searxng", true, true));
    }

    @Test
    void loneRestingProviderIsStillAskedAndBackInTheChainOnceItAnswers() {
        Engine free = new Engine("searxng", 10, 0, Outcome.failure("engines down"), Outcome.found(List.of(RAZER)));
        WebSearch search = chain(free);

        search.search(AiScope.of(AiFeature.CARD), "q1", 8);
        WebSearch.Found second = search.search(AiScope.of(AiFeature.CARD), "q2", 8);

        assertThat(free.asked).isEqualTo(2);
        assertThat(second.hits()).containsExactly(RAZER);
        assertThat(search.providers()).containsExactly(new WebSearch.ProviderState("searxng", true, false));
    }

    @Test
    void noProviderConfiguredIsJournalledAsAFailedSearch() {
        WebSearch.Found found = new WebSearch(List.of(), usage, pacer(), clock, policy, events).search(AiScope.of(AiFeature.CARD), "q", 8);

        assertThat(found.empty()).isTrue();
        verify(usage).call(eq(AiScope.of(AiFeature.CARD)), eq(AiUsage.Kind.SEARCH), eq("none"), eq(AiUsage.Result.FAILED), eq(0L),
                anyLong(), any());
    }

    @Test
    void allProvidersDownGivesAnEmptyAnswerNotAnError() {
        Engine free = new Engine("searxng", 10, 0, Outcome.failure("HTTP 502"));

        assertThat(chain(free).search(AiScope.of(AiFeature.CARD), "q", 8).empty()).isTrue();
    }

    @Test
    void ourShopAndSocialVideoAreNeverSources() {
        assertThat(WebSearch.skipped("https://www.chisetup.com.ua/p/x")).isTrue();
        assertThat(WebSearch.skipped("https://m.youtube.com/watch?v=1")).isTrue();
        assertThat(WebSearch.skipped("not a url")).isTrue();
        assertThat(WebSearch.skipped("https://razer.com/v3")).isFalse();
    }

    private AiSearchPacer pacer() {
        return new AiSearchPacer(store, policy, clock, d -> { });
    }

    /** The database of the pacer, in memory: no requests in the window, rests remembered. */
    private static final class MemoryStore extends AiSearchPaceStore {
        private final java.util.Map<String, Instant> rests = new java.util.HashMap<>();

        MemoryStore() {
            super(null);
        }

        @Override
        public int requestsSince(Instant since) {
            return 0;
        }

        @Override
        public java.util.Optional<Instant> restUntil(String provider) {
            return java.util.Optional.ofNullable(rests.get(provider));
        }

        @Override
        public void rest(String provider, Instant until, String reason) {
            rests.put(provider, until);
        }

        @Override
        public void clear(String provider) {
            rests.remove(provider);
        }
    }

    private WebSearch chain(SearchEngine... engines) {
        return new WebSearch(List.of(engines), usage, pacer(), clock, policy, events);
    }

    private static final class Engine implements SearchEngine {
        final String name;
        final int order;
        final long cost;
        final Deque<Outcome> answers;
        int asked;

        Engine(String name, int order, long cost, Outcome... answers) {
            this.name = name;
            this.order = order;
            this.cost = cost;
            this.answers = new ArrayDeque<>(List.of(answers));
        }

        public String name() {
            return name;
        }

        public int order() {
            return order;
        }

        public boolean enabled() {
            return true;
        }

        public long costMicroUsd() {
            return cost;
        }

        public Outcome search(String query, int limit) {
            asked++;
            return answers.isEmpty() ? Outcome.found(List.of()) : answers.poll();
        }
    }
}
