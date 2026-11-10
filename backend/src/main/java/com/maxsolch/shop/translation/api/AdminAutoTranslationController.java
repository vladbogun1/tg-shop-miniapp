package com.maxsolch.shop.translation.api;

import com.maxsolch.shop.platform.security.RequiredSuperAdmin;
import com.maxsolch.shop.translation.app.AutoTranslationStatus;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** «Автоперевод» on the translations screen (main admin only, like the screen itself). */
@RestController
@RequestMapping("/api/admin/translations/auto")
@RequiredSuperAdmin
@Tag(name = "Admin Translations", description = "Content translations (uk/en) over the Russian source")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAutoTranslationController {

    private final AutoTranslationStatus status;

    public AdminAutoTranslationController(AutoTranslationStatus status) {
        this.status = status;
    }

    @GetMapping
    @Operation(summary = "Auto-translation: whether it runs (a DeepL key is set), the characters of the month and "
            + "the last background run")
    public AutoTranslationStatus.AutoTranslationView status() {
        return status.view();
    }
}
