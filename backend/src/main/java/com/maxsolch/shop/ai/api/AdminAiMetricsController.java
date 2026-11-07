package com.maxsolch.shop.ai.api;

import com.maxsolch.shop.ai.app.AiMetrics;
import com.maxsolch.shop.ai.app.AiMetricsDtos;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiresFinance;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The «ИИ» tab of the metrics: money, share of the built-in way, quality. Finance right only. */
@RestController
@RequestMapping("/api/admin/ai/metrics")
@RequiredAdmin
@RequiresFinance
@Tag(name = "Admin AI metrics", description = "AI spend, share of the built-in way, accepted without edits (finance only)")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAiMetricsController {

    private final AiMetrics metrics;

    public AdminAiMetricsController(AiMetrics metrics) {
        this.metrics = metrics;
    }

    @GetMapping("/summary")
    @Operation(summary = "Month against the limit + the period: accepted, spent, built-in share, without edits, waiting, "
            + "money in vain. from/to are shop days (yyyy-MM-dd), none = the month so far; withTest adds the technical admin")
    public AiMetricsDtos.Summary summary(@RequestParam(required = false) String from,
                                         @RequestParam(required = false) String to,
                                         @RequestParam(defaultValue = "false") boolean withTest) {
        return metrics.summary(from, to, withTest);
    }

    @GetMapping
    @Operation(summary = "Breakdown of the period: groupBy = day | feature | provider")
    public AiMetricsDtos.Series series(@RequestParam String groupBy,
                                       @RequestParam(required = false) String from,
                                       @RequestParam(required = false) String to,
                                       @RequestParam(defaultValue = "false") boolean withTest) {
        return metrics.series(groupBy, from, to, withTest);
    }
}
