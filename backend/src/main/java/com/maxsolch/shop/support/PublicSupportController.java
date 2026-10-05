package com.maxsolch.shop.support;

import com.maxsolch.shop.support.SupportDtos.ConfigDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Lets a guest's page decide whether to show «Запитати про товар» / «Підтримка» at all. */
@RestController
@Tag(name = "Support", description = "Customer support threads (questions not tied to an order)")
public class PublicSupportController {

    private final SupportService support;

    public PublicSupportController(SupportService support) {
        this.support = support;
    }

    @GetMapping("/api/public/support/config")
    @Operation(summary = "Whether support is on and the message limits (no auth)")
    public ConfigDto config() {
        return support.config();
    }
}
