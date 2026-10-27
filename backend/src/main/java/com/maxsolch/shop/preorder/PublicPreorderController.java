package com.maxsolch.shop.preorder;

import com.maxsolch.shop.preorder.PreorderDtos.ComingDto;
import com.maxsolch.shop.preorder.PreorderDtos.ProductPreorderDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Pre-orders for guests (site, SSR): what is coming and the product block without «my» places. */
@RestController
@Tag(name = "Public Preorders", description = "Goods on their way, no login")
public class PublicPreorderController {

    private final PreorderQueueService queue;

    public PublicPreorderController(PreorderQueueService queue) {
        this.queue = queue;
    }

    @GetMapping("/api/public/preorders")
    @Operation(summary = "«Скоро в наявності»: open batches, soonest first")
    public List<ComingDto> coming() {
        return queue.coming();
    }

    @GetMapping("/api/public/products/{productId}/preorder")
    @Operation(summary = "Pre-order block of a product page for a guest")
    public ProductPreorderDto forProduct(@PathVariable String productId) {
        return queue.forProduct(productId, null);
    }
}
