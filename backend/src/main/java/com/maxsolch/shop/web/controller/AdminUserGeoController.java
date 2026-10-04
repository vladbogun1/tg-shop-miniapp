package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.geo.UserGeoAdminService;
import com.maxsolch.shop.geo.UserGeoDtos;
import com.maxsolch.shop.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

/**
 * Users map in the admin ("Пользователи → Аналитика"): where visitors were last seen from (IP →
 * city via the offline GeoIP base) and how many are online right now.
 */
@RestController
@RequestMapping("/api/admin/users/geo")
@RequiredAdmin
@Tag(name = "Admin Users Map", description = "Visitor locations by IP + online now")
@SecurityRequirement(name = "bearer-jwt")
public class AdminUserGeoController {

    private final UserGeoAdminService service;

    public AdminUserGeoController(UserGeoAdminService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "Map points (visitors grouped by place) seen in the last `days` (1..90) + online now")
    public UserGeoDtos.Overview overview(@RequestParam(defaultValue = "30") int days) {
        return service.overview(days);
    }

    @GetMapping("/online")
    @Operation(summary = "Distinct visitors with client events in the last 5 minutes (Mini App / site / total)")
    public UserGeoDtos.Online online() {
        return service.online();
    }

    @GetMapping("/point")
    @Operation(summary = "Signed-in users (and anonymous IPs) last seen at one map point")
    public UserGeoDtos.PointDetails point(@RequestParam BigDecimal lat,
                                          @RequestParam BigDecimal lon,
                                          @RequestParam(defaultValue = "30") int days) {
        return service.point(lat, lon, days);
    }
}
