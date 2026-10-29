package com.maxsolch.shop.preorder.api;

import com.maxsolch.shop.preorder.app.MyPreorders;
import com.maxsolch.shop.preorder.app.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ProductPreorderDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.SubscribeRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Customer side of pre-orders (Mini App and site): join / leave a queue, «Мої очікування». */
@RestController
@RequestMapping("/api/me/preorders")
@Tag(name = "Preorders", description = "Waitlist for goods that are out of stock or on their way")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class PreorderController {

    private final MyPreorders preorders;

    public PreorderController(MyPreorders preorders) {
        this.preorders = preorders;
    }

    @GetMapping
    @Operation(summary = "My places in queues: live first, then recent history")
    public List<MyPreorderDto> list() {
        return preorders.list();
    }

    @GetMapping("/product/{productId}")
    @Operation(summary = "Pre-order block of a product page, with my places in its queues")
    public ProductPreorderDto forProduct(@PathVariable String productId) {
        return preorders.forProduct(productId);
    }

    @PostMapping
    @Operation(summary = "Join the queue for an out-of-stock product/variant (again = change the quantity)")
    public MyPreorderDto subscribe(@RequestBody SubscribeRequest req) {
        return preorders.join(req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Leave a queue (a held unit goes to the next person)")
    public ResponseEntity<Void> unsubscribe(@PathVariable long id) {
        preorders.leave(id);
        return ResponseEntity.noContent().build();
    }
}
