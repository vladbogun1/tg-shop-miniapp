package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.web.dto.AppInfoDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "App", description = "Public app configuration")
public class AppInfoController {

    private final AppProperties props;

    public AppInfoController(AppProperties props) {
        this.props = props;
    }

    @GetMapping("/app-info")
    @Operation(summary = "Public app info for the frontend")
    public AppInfoDto appInfo() {
        return new AppInfoDto(
                props.getTelegram().getBotUsername(),
                props.getWebappBaseUrl(),
                props.getImageBaseUrl());
    }
}
