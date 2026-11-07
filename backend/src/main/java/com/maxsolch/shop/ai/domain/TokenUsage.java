package com.maxsolch.shop.ai.domain;

/**
 * TokenUsage of one model request: {@code input} is the part billed at the full price, {@code cached} the part read from
 * the prompt cache (10× cheaper), {@code output} includes the model's thinking.
 */
public record TokenUsage(int input, int cached, int output) {

    public static final TokenUsage NONE = new TokenUsage(0, 0, 0);

    public TokenUsage plus(TokenUsage o) {
        return new TokenUsage(input + o.input, cached + o.cached, output + o.output);
    }

    /**
     * Cost in micro-USD at prices per million tokens, also in micro-USD (MiniMax M3.1 Flash: 150 000 in,
     * 15 000 cache read, 600 000 out). Rounded up so that a stream of tiny calls never sums to zero.
     */
    public long costMicroUsd(long inPerM, long cachedPerM, long outPerM) {
        long nano = (long) input * inPerM + (long) cached * cachedPerM + (long) output * outPerM;
        return (nano + 999_999) / 1_000_000;
    }
}
