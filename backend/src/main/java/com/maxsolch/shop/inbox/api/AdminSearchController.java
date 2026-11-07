package com.maxsolch.shop.inbox.api;

import com.maxsolch.shop.inbox.app.AdminSearch;
import com.maxsolch.shop.inbox.app.AdminSearch.SearchResults;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/search")
@RequiredAdmin
@Tag(name = "Admin Search", description = "The «go to» box of the admin")
@SecurityRequirement(name = "bearer-jwt")
public class AdminSearchController {

    private final AdminSearch search;

    public AdminSearchController(AdminSearch search) {
        this.search = search;
    }

    @GetMapping
    @Operation(summary = "Up to 5 orders (number, phone, name), products (title, article) and customers (name, @username, "
            + "phone) for the term; fewer than 2 characters give empty groups")
    public SearchResults search(@RequestParam(name = "q", required = false) String q) {
        return search.search(q);
    }
}
