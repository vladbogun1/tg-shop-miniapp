package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiUsage;
import com.maxsolch.shop.ai.domain.UsageLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface AiUsageRepository extends JpaRepository<AiUsage, Long> {

    @Query("select coalesce(sum(u.costMicroUsd), 0) from AiUsage u where u.createdAt >= :from")
    long spentSince(@Param("from") Instant from);

    /** Per kind, provider and result since {@code from}: calls, cost, tokens — the «Расход ИИ» summary. */
    @Query("""
            select new com.maxsolch.shop.ai.domain.UsageLine(u.kind, u.provider, u.result, count(u),
                   coalesce(sum(u.costMicroUsd), 0), coalesce(sum(u.inputTokens), 0), coalesce(sum(u.cachedTokens), 0),
                   coalesce(sum(u.outputTokens), 0))
            from AiUsage u where u.createdAt >= :from
            group by u.kind, u.provider, u.result
            order by u.kind, u.provider, u.result""")
    List<UsageLine> summarySince(@Param("from") Instant from);
}
