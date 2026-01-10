package com.example.tgshop.api;

import com.example.tgshop.api.dto.AdminLoginRequest;
import com.example.tgshop.api.dto.CreateOrderRequest;
import com.example.tgshop.api.dto.CreateProductRequest;
import com.example.tgshop.api.dto.OrderDto;
import com.example.tgshop.api.dto.OrderItemDto;
import com.example.tgshop.api.dto.ProductDto;
import com.example.tgshop.api.dto.UpdateProductActiveRequest;
import com.example.tgshop.api.dto.UpdateProductRequest;
import com.example.tgshop.config.AppProperties;
import com.example.tgshop.common.UuidUtil;
import com.example.tgshop.order.OrderService;
import com.example.tgshop.order.OrderRepository;
import com.example.tgshop.product.Product;
import com.example.tgshop.product.ProductImage;
import com.example.tgshop.product.ProductRepository;
import com.example.tgshop.security.TgInitDataValidator;
import com.example.tgshop.tg.TgPostImageResolver;
import jakarta.validation.Valid;

import java.util.List;
import java.util.UUID;

import lombok.AllArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@AllArgsConstructor
public class ApiController {

    private final ProductRepository productRepository;
    private final TgInitDataValidator initDataValidator;
    private final AppProperties props;
    private final OrderService orderService;
    private final OrderRepository orderRepository;
    private final TgPostImageResolver tgPostImageResolver;


    @GetMapping("/products")
    public List<ProductDto> products() {
        return productRepository.findActiveWithImages().stream().map(ApiController::toDto).toList();
    }

    @GetMapping("/admin/products")
    public List<ProductDto> adminProducts(@RequestParam(value = "initData", required = false) String initData,
                                          @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword) {
        assertAdmin(initData, adminPassword);
        return productRepository.findAllWithImages().stream().map(ApiController::toDto).toList();
    }

    @GetMapping("/admin/orders")
    public List<OrderDto> adminOrders(@RequestParam(value = "initData", required = false) String initData,
                                      @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword) {
        assertAdmin(initData, adminPassword);
        return orderRepository.findAllWithItems().stream()
            .map(ApiController::toOrderDto)
            .toList();
    }

    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    public Object createOrder(@RequestBody @Valid CreateOrderRequest req) {
        var v = initDataValidator.validate(req.initData());
        if (!v.ok()) throw new Unauthorized("Bad initData");

        var cmd = new OrderService.CreateOrderCommand(
                v.userId(),
                v.username(),
                req.customerName(),
                req.phone(),
                req.address(),
                req.comment(),
                req.items().stream().map(i -> new OrderService.Item(i.productId(), i.quantity())).toList()
        );

        var saved = orderService.createOrder(cmd);
        return new Object() {
            public final String orderId = saved.uuid().toString();
        };
    }

    @GetMapping("/me")
    public Object me(@RequestParam("initData") String initData) {
        var v = initDataValidator.validate(initData);
        if (!v.ok()) throw new Unauthorized("Bad initData");
        boolean isAdmin = props.getTelegram().adminUserIdSet().contains(v.userId());

        return new Object() {
            public final long userId = v.userId();
            public final String username = v.username();
            public final String firstName = v.firstName();
            public final String lastName = v.lastName();
            public final boolean admin = isAdmin;
        };
    }

    @PostMapping("/admin/products")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductDto createProduct(@RequestParam(value = "initData", required = false) String initData,
                                    @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword,
                                    @RequestBody @Valid CreateProductRequest req) {
        assertAdmin(initData, adminPassword);

        Product p = new Product();
        p.setTitle(req.title());
        p.setDescription(req.description());
        p.setPriceMinor(req.priceMinor());
        p.setCurrency(req.currency());
        p.setStock(req.stock());
        p.setActive(req.active());

        var resolvedUrls = tgPostImageResolver.resolveImages(req.imageUrls());
        int i = 0;
        for (String url : resolvedUrls) {
            var img = new ProductImage();
            img.setProduct(p);
            img.setUrl(url);
            img.setSortOrder(i++);
            p.getImages().add(img);
        }

        var saved = productRepository.save(p);
        return toDto(saved);
    }

    @PatchMapping("/admin/products/{productId}/active")
    public ProductDto updateProductActive(@RequestParam(value = "initData", required = false) String initData,
                                          @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword,
                                          @PathVariable("productId") String productId,
                                          @RequestBody @Valid UpdateProductActiveRequest req) {
        assertAdmin(initData, adminPassword);

        byte[] idBytes = UuidUtil.toBytes(UUID.fromString(productId));
        Product product = productRepository.findByIdWithImages(idBytes)
                .orElseThrow(() -> new NotFound("Product not found"));
        product.setActive(req.active());
        var saved = productRepository.save(product);
        return toDto(saved);
    }

    @PatchMapping("/admin/products/{productId}")
    public ProductDto updateProduct(@RequestParam(value = "initData", required = false) String initData,
                                    @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword,
                                    @PathVariable("productId") String productId,
                                    @RequestBody @Valid UpdateProductRequest req) {
        assertAdmin(initData, adminPassword);

        byte[] idBytes = UuidUtil.toBytes(UUID.fromString(productId));
        Product product = productRepository.findByIdWithImages(idBytes)
            .orElseThrow(() -> new NotFound("Product not found"));

        product.setTitle(req.title());
        product.setDescription(req.description());
        product.setPriceMinor(req.priceMinor());
        product.setCurrency(req.currency());
        product.setStock(req.stock());
        product.setActive(req.active());

        product.getImages().clear();
        var resolvedUrls = tgPostImageResolver.resolveImages(req.imageUrls());
        int i = 0;
        for (String url : resolvedUrls) {
            var img = new ProductImage();
            img.setProduct(product);
            img.setUrl(url);
            img.setSortOrder(i++);
            product.getImages().add(img);
        }

        var saved = productRepository.save(product);
        return toDto(saved);
    }

    @PostMapping("/admin/login")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void adminLogin(@RequestBody @Valid AdminLoginRequest req) {
        if (!isPasswordValid(req.password())) {
            throw new Unauthorized("Bad password");
        }
    }

    private void assertAdmin(String initData, String adminPassword) {
        if (isPasswordValid(adminPassword)) return;
        if (initData == null || initData.isBlank()) throw new Forbidden("Not admin");
        var v = initDataValidator.validate(initData);
        if (!v.ok()) throw new Unauthorized("Bad initData");
        if (!props.getTelegram().adminUserIdSet().contains(v.userId())) throw new Forbidden("Not admin");
    }

    private boolean isPasswordValid(String adminPassword) {
        String expected = props.getSecurity().getAdminPassword();
        return adminPassword != null
            && !adminPassword.isBlank()
            && expected != null
            && !expected.isBlank()
            && expected.equals(adminPassword);
    }

    private static ProductDto toDto(Product p) {
        return new ProductDto(
                p.uuid(),
                p.getTitle(),
                p.getDescription(),
                p.getPriceMinor(),
                p.getCurrency(),
                p.getStock(),
                p.getImages().stream().map(ProductImage::getUrl).toList(),
                p.isActive()
        );
    }

    private static OrderDto toOrderDto(com.example.tgshop.order.OrderEntity o) {
        return new OrderDto(
            o.uuid(),
            o.getTotalMinor(),
            o.getCurrency(),
            o.getCustomerName(),
            o.getPhone(),
            o.getAddress(),
            o.getComment(),
            o.getTgUserId(),
            o.getTgUsername(),
            o.getStatus(),
            o.getCreatedAt(),
            o.getItems().stream()
                .map(i -> new OrderItemDto(
                    UuidUtil.fromBytes(i.getProductId()),
                    i.getTitleSnapshot(),
                    i.getPriceMinorSnapshot(),
                    i.getQuantity()
                ))
                .toList()
        );
    }

    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    private static class Unauthorized extends RuntimeException {
        Unauthorized(String m) {
            super(m);
        }
    }

    @ResponseStatus(HttpStatus.FORBIDDEN)
    private static class Forbidden extends RuntimeException {
        Forbidden(String m) {
            super(m);
        }
    }

    @ResponseStatus(HttpStatus.NOT_FOUND)
    private static class NotFound extends RuntimeException {
        NotFound(String m) {
            super(m);
        }
    }
}
