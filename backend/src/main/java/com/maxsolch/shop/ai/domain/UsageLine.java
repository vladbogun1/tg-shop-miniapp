package com.maxsolch.shop.ai.domain;

/** One line of the «Расход ИИ» summary: calls of one kind to one provider with one result over a period. */
public record UsageLine(AiUsage.Kind kind, String provider, AiUsage.Result result, long calls, long costMicroUsd,
                        long inputTokens, long cachedTokens, long outputTokens) {
}
