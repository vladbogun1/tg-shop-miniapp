package com.maxsolch.shop.customer.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.time.TimeRange;
import com.maxsolch.shop.customer.app.UserAdminService;
import com.maxsolch.shop.customer.domain.UserCardDto;
import com.maxsolch.shop.customer.app.UserMetricsDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/users")
@RequiredAdmin
@Tag(name = "Admin Users", description = "Bot users list + analytics")
@SecurityRequirement(name = "bearer-jwt")
public class AdminUserController {

    private final UserAdminService userAdminService;

    public AdminUserController(UserAdminService userAdminService) {
        this.userAdminService = userAdminService;
    }

    @GetMapping
    @Operation(summary = "Paged/searchable/sortable list of bot users")
    public List<UserCardDto> list(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean blockedOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String sortDir) {
        return userAdminService.list(q, blockedOnly, page, size, sortBy, sortDir);
    }

    @GetMapping("/metrics")
    @Operation(summary = "User analytics for range=month|halfyear|year|all (default month)")
    public UserMetricsDto metrics(@RequestParam(defaultValue = "month") String range) {
        return userAdminService.metrics(TimeRange.parse(range));
    }
}
