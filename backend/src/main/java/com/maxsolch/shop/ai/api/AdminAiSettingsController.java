package com.maxsolch.shop.ai.api;

import com.maxsolch.shop.ai.app.AiState;
import com.maxsolch.shop.ai.app.WebSearch;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiresFinance;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** The owner's side of the AI: state with the money, the search check, the stop button. Finance right only. */
@RestController
@RequestMapping("/api/admin/ai")
@RequiredAdmin
@RequiresFinance
@Tag(name = "Admin AI settings", description = "AI state, spend and limits; search check; stop all (finance only)")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAiSettingsController {

    private final AiState state;

    public AdminAiSettingsController(AiState state) {
        this.state = state;
    }

    public record SearchTestRequest(String query) {
    }

    @GetMapping("/state")
    @Operation(summary = "Key set or not, today and this month against the limits, free search left, providers, running jobs")
    public AiState.State state() {
        return state.state();
    }

    @PostMapping("/search-test")
    @Operation(summary = "One query through the search chain, as the model gets it")
    public WebSearch.Found searchTest(@RequestBody SearchTestRequest body) {
        return state.testSearch(body.query());
    }

    @PostMapping("/stop-running")
    @Operation(summary = "Stop every running task and drop the queued ones")
    public Map<String, Integer> stopRunning() {
        return Map.of("stopped", state.stopRunning());
    }
}
