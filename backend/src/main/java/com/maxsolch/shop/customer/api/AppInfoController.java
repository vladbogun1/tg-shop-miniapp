package com.maxsolch.shop.customer.api;

import com.maxsolch.shop.customer.app.AppInfo;
import com.maxsolch.shop.customer.app.AppInfoDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "App", description = "Public app configuration")
public class AppInfoController {

    private final AppInfo appInfo;

    public AppInfoController(AppInfo appInfo) {
        this.appInfo = appInfo;
    }

    @GetMapping("/app-info")
    @Operation(summary = "Public app info for the frontend")
    public AppInfoDto appInfo() {
        return appInfo.current();
    }
}
