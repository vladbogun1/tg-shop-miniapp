package com.maxsolch.shop.preorder.api;

import com.maxsolch.shop.preorder.app.PreorderQueueReader;
import com.maxsolch.shop.preorder.app.PreorderDtos.ComingDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ProductPreorderDto;
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

    private final PreorderQueueReader reader;

    public PublicPreorderController(PreorderQueueReader reader) {
        this.reader = reader;
    }

    @GetMapping("/api/public/preorders")
    @Operation(summary = "«Скоро в наявності»: open batches, soonest first")
    public List<ComingDto> coming() {
        return reader.coming();
    }

    @GetMapping("/api/public/products/{productId}/preorder")
    @Operation(summary = "Pre-order block of a product page for a guest")
    public ProductPreorderDto forProduct(@PathVariable String productId) {
        return reader.forProduct(productId, null);
    }
}
