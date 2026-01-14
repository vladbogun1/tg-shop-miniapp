package com.example.tgshop.api;

import com.example.tgshop.api.dto.AdminLoginRequest;
import com.example.tgshop.api.dto.CreateOrderRequest;
import com.example.tgshop.api.dto.CreateProductRequest;
import com.example.tgshop.api.dto.CreateTagRequest;
import com.example.tgshop.api.dto.OrderDto;
import com.example.tgshop.api.dto.OrderItemDto;
import com.example.tgshop.api.dto.ProductDto;
import com.example.tgshop.api.dto.TagDto;
import com.example.tgshop.api.dto.UpdateProductArchivedRequest;
import com.example.tgshop.api.dto.UpdateProductActiveRequest;
import com.example.tgshop.api.dto.UpdateProductRequest;
import com.example.tgshop.api.dto.UpdateTagRequest;
import com.example.tgshop.config.AppProperties;
import com.example.tgshop.common.UuidUtil;
import com.example.tgshop.order.OrderService;
import com.example.tgshop.order.OrderItemRepository;
import com.example.tgshop.order.OrderRepository;
import com.example.tgshop.product.Product;
import com.example.tgshop.product.ProductImage;
import com.example.tgshop.product.ProductRepository;
import com.example.tgshop.security.TgInitDataValidator;
import com.example.tgshop.tag.Tag;
import com.example.tgshop.tag.TagRepository;
import com.example.tgshop.media.ImageStorageService;
import com.example.tgshop.tg.TgPostImageResolver;
import jakarta.validation.Valid;

import java.util.List;
import java.time.Instant;
import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@AllArgsConstructor
@Slf4j
public class ApiController {

    private final ProductRepository productRepository;
    private final TgInitDataValidator initDataValidator;
    private final AppProperties props;
    private final OrderService orderService;
    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final TgPostImageResolver tgPostImageResolver;
    private final TagRepository tagRepository;
    private final ImageStorageService imageStorageService;


    @GetMapping("/products")
    public List<ProductDto> products() {
        log.info("🛒 API Requesting active products");
        var soldCounts = loadSoldCounts();
        var result = productRepository.findActiveWithImages().stream()
            .map(p -> toDto(p, soldCounts))
            .toList();
        log.debug("🛒 API Returning {} active products", result.size());
        return result;
    }

    @GetMapping("/tags")
    public List<TagDto> tags() {
        log.info("🛒 API Requesting tags");
        return tagRepository.findAll().stream()
            .sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
            .map(ApiController::toTagDto)
            .toList();
    }

    @GetMapping("/app-info")
    public Object appInfo() {
        return new Object() {
            public final String botUsername = props.getTelegram().getBotUsername();
            public final String webappBaseUrl = props.getWebapp().getBaseUrl();
        };
    }

    @GetMapping("/admin/products")
    public List<ProductDto> adminProducts(@RequestParam(value = "initData", required = false) String initData,
                                          @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword) {
        assertAdmin(initData, adminPassword);
        log.info("🛒 API Requesting admin product list");
        var soldCounts = loadSoldCounts();
        var result = productRepository.findAllWithImages().stream()
            .map(p -> toDto(p, soldCounts))
            .toList();
        log.debug("🛒 API Returning {} products for admin", result.size());
        return result;
    }

    @GetMapping("/admin/tags")
    public List<TagDto> adminTags(@RequestParam(value = "initData", required = false) String initData,
                                  @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword) {
        assertAdmin(initData, adminPassword);
        log.info("🛒 API Requesting admin tag list");
        return tagRepository.findAll().stream()
            .sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
            .map(ApiController::toTagDto)
            .toList();
    }

    @PostMapping("/admin/tags")
    @ResponseStatus(HttpStatus.CREATED)
    public TagDto createTag(@RequestParam(value = "initData", required = false) String initData,
                            @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword,
                            @RequestBody @Valid CreateTagRequest req) {
        assertAdmin(initData, adminPassword);
        String name = req.name().trim();
        log.info("🛒 API Creating tag name={}", name);
        var existing = tagRepository.findByNameIgnoreCase(name);
        if (existing.isPresent()) {
            log.info("🛒 API Tag already exists name={}", name);
            return toTagDto(existing.get());
        }
        Tag tag = new Tag();
        tag.setName(name);
        var saved = tagRepository.save(tag);
        log.info("🛒 API Tag created uuid={}", saved.uuid());
        return toTagDto(saved);
    }

    @PatchMapping("/admin/tags/{id}")
    public TagDto updateTag(@PathVariable("id") UUID id,
                            @RequestParam(value = "initData", required = false) String initData,
                            @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword,
                            @RequestBody @Valid UpdateTagRequest req) {
        assertAdmin(initData, adminPassword);
        String name = req.name().trim();
        log.info("🛒 API Updating tag uuid={} name={}", id, name);
        Tag tag = tagRepository.findById(UuidUtil.toBytes(id))
            .orElseThrow(() -> new NotFound("Tag not found: " + id));
        var existing = tagRepository.findByNameIgnoreCase(name);
        if (existing.isPresent() && !existing.get().uuid().equals(tag.uuid())) {
            throw new BadRequest("Tag name already exists");
        }
        tag.setName(name);
        var saved = tagRepository.save(tag);
        return toTagDto(saved);
    }

    @DeleteMapping("/admin/tags/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTag(@PathVariable("id") UUID id,
                          @RequestParam(value = "initData", required = false) String initData,
                          @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword) {
        assertAdmin(initData, adminPassword);
        log.info("🛒 API Deleting tag uuid={}", id);
        Tag tag = tagRepository.findById(UuidUtil.toBytes(id))
            .orElseThrow(() -> new NotFound("Tag not found: " + id));
        tagRepository.delete(tag);
        log.info("🛒 API Tag deleted uuid={}", id);
    }

    @GetMapping("/admin/products/archived")
    public List<ProductDto> adminArchivedProducts(@RequestParam(value = "initData", required = false) String initData,
                                                  @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword) {
        assertAdmin(initData, adminPassword);
        log.info("🛒 API Requesting archived products for admin");
        var soldCounts = loadSoldCounts();
        var result = productRepository.findArchivedWithImages().stream()
            .map(p -> toDto(p, soldCounts))
            .toList();
        log.debug("🛒 API Returning {} archived products for admin", result.size());
        return result;
    }

    @GetMapping("/admin/orders")
    public List<OrderDto> adminOrders(@RequestParam(value = "initData", required = false) String initData,
                                      @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword) {
        assertAdmin(initData, adminPassword);
        log.info("🛒 API Requesting admin order list");
        var result = orderRepository.findAllWithItems().stream()
            .map(ApiController::toOrderDto)
            .toList();
        log.debug("🛒 API Returning {} orders for admin", result.size());
        return result;
    }

    @DeleteMapping("/admin/orders/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteOrder(@PathVariable("id") UUID id,
                            @RequestParam(value = "initData", required = false) String initData,
                            @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword) {
        assertAdmin(initData, adminPassword);
        log.info("🛒 API Deleting order uuid={}", id);
        var order = orderRepository.findById(UuidUtil.toBytes(id))
            .orElseThrow(() -> {
                log.warn("🛒 API Order delete failed: not found uuid={}", id);
                return new NotFound("Order not found: " + id);
            });
        orderRepository.delete(order);
        log.info("🛒 API Order deleted uuid={}", id);
    }

    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    public Object createOrder(@RequestBody @Valid CreateOrderRequest req) {
        var v = initDataValidator.validate(req.initData());
        if (!v.ok()) {
            log.warn("🛒 API Order creation rejected due to invalid initData");
            throw new Unauthorized("Bad initData");
        }

        var cmd = new OrderService.CreateOrderCommand(
                v.userId(),
                v.username(),
                req.customerName(),
                req.phone(),
                req.address(),
                req.comment(),
                req.items().stream().map(i -> new OrderService.Item(i.productId(), i.quantity())).toList()
        );

        log.info("🛒 API Creating order for tgUserId={} items={}", v.userId(), cmd.items().size());
        var saved = orderService.createOrder(cmd);
        log.info("🛒 API Order created uuid={} totalMinor={}", saved.uuid(), saved.getTotalMinor());
        return new Object() {
            public final String orderId = saved.uuid().toString();
        };
    }

    @GetMapping("/me")
    public Object me(@RequestParam("initData") String initData) {
        var v = initDataValidator.validate(initData);
        if (!v.ok()) {
            log.warn("🛒 API Profile request rejected due to invalid initData");
            throw new Unauthorized("Bad initData");
        }
        boolean isAdmin = props.getTelegram().adminUserIdSet().contains(v.userId());

        log.info("🛒 API Returning profile for tgUserId={} admin={}", v.userId(), isAdmin);
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
        log.info("🛒 API Creating product title={} priceMinor={} stock={}", req.title(), req.priceMinor(), req.stock());

        Product p = new Product();
        UUID productId = UUID.randomUUID();
        p.setId(UuidUtil.toBytes(productId));
        p.setCreatedAt(Instant.now());
        p.setTitle(req.title());
        p.setDescription(req.description());
        p.setPriceMinor(req.priceMinor());
        p.setCurrency(req.currency());
        p.setStock(req.stock());
        p.setActive(req.active());
        p.setArchived(false);
        p.getTags().addAll(resolveTags(req.tagIds()));

        var resolvedUrls = tgPostImageResolver.resolveImages(req.imageUrls());
        log.debug("🛒 API Resolved {} image urls for new product", resolvedUrls.size());
        var storedUrls = imageStorageService.downloadImages(productId, resolvedUrls);
        int i = 0;
        for (String url : storedUrls) {
            var img = new ProductImage();
            img.setProduct(p);
            img.setUrl(url);
            img.setSortOrder(i++);
            p.getImages().add(img);
        }

        var saved = productRepository.save(p);
        log.info("🛒 API Product created uuid={} images={}", saved.uuid(), saved.getImages().size());
        return toDto(saved, 0L);
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
        log.info("🛒 API Updated product active uuid={} active={}", saved.uuid(), saved.isActive());
        return toDto(saved, soldCountFor(saved));
    }

    @PatchMapping("/admin/products/{productId}/archived")
    public ProductDto updateProductArchived(@RequestParam(value = "initData", required = false) String initData,
                                            @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword,
                                            @PathVariable("productId") String productId,
                                            @RequestBody @Valid UpdateProductArchivedRequest req) {
        assertAdmin(initData, adminPassword);

        byte[] idBytes = UuidUtil.toBytes(UUID.fromString(productId));
        Product product = productRepository.findByIdWithImages(idBytes)
            .orElseThrow(() -> new NotFound("Product not found"));
        product.setArchived(req.archived());
        if (req.archived()) {
            product.setActive(false);
        }
        var saved = productRepository.save(product);
        log.info("🛒 API Updated product archived uuid={} archived={}", saved.uuid(), saved.isArchived());
        return toDto(saved, soldCountFor(saved));
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
        log.debug("🛒 API Resolved {} image urls for product update uuid={}", resolvedUrls.size(), product.uuid());
        var storedUrls = imageStorageService.downloadImages(product.uuid(), resolvedUrls, true);
        int i = 0;
        for (String url : storedUrls) {
            var img = new ProductImage();
            img.setProduct(product);
            img.setUrl(url);
            img.setSortOrder(i++);
            product.getImages().add(img);
        }
        product.getTags().clear();
        product.getTags().addAll(resolveTags(req.tagIds()));

        var saved = productRepository.save(product);
        log.info("🛒 API Updated product uuid={} images={}", saved.uuid(), saved.getImages().size());
        return toDto(saved, soldCountFor(saved));
    }

    @PostMapping("/admin/login")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void adminLogin(@RequestBody @Valid AdminLoginRequest req) {
        if (!isPasswordValid(req.password())) {
            log.warn("🛒 API Admin login failed due to invalid password");
            throw new Unauthorized("Bad password");
        }
        log.info("🛒 API Admin login succeeded");
    }

    private void assertAdmin(String initData, String adminPassword) {
        if (isPasswordValid(adminPassword)) {
            log.debug("🛒 API Admin access granted via password");
            return;
        }
        if (initData == null || initData.isBlank()) {
            log.warn("🛒 API Admin access denied: missing initData");
            throw new Forbidden("Not admin");
        }
        var v = initDataValidator.validate(initData);
        if (!v.ok()) {
            log.warn("🛒 API Admin access denied: invalid initData");
            throw new Unauthorized("Bad initData");
        }
        if (!props.getTelegram().adminUserIdSet().contains(v.userId())) {
            log.warn("🛒 API Admin access denied for tgUserId={}", v.userId());
            throw new Forbidden("Not admin");
        }
        log.debug("🛒 API Admin access granted via initData for tgUserId={}", v.userId());
    }

    private boolean isPasswordValid(String adminPassword) {
        String expected = props.getSecurity().getAdminPassword();
        return adminPassword != null
            && !adminPassword.isBlank()
            && expected != null
            && !expected.isBlank()
            && expected.equals(adminPassword);
    }

    private long soldCountFor(Product p) {
        var sold = orderItemRepository.sumSoldByProductId(p.getId());
        log.debug("🛒 API Loaded sold count for product uuid={} sold={}", p.uuid(), sold);
        return sold;
    }

    private java.util.Map<UUID, Long> loadSoldCounts() {
        var result = orderItemRepository.findSoldCounts().stream()
            .collect(java.util.stream.Collectors.toMap(
                row -> UuidUtil.fromBytes(row.getProductId()),
                row -> row.getSold() == null ? 0L : row.getSold()
            ));
        log.debug("🛒 API Loaded sold counts for {} products", result.size());
        return result;
    }

    private static ProductDto toDto(Product p, java.util.Map<UUID, Long> soldCounts) {
        long soldCount = soldCounts.getOrDefault(p.uuid(), 0L);
        return toDto(p, soldCount);
    }

    private static ProductDto toDto(Product p, long soldCount) {
        return new ProductDto(
                p.uuid(),
                p.getTitle(),
                p.getDescription(),
                p.getPriceMinor(),
                p.getCurrency(),
                p.getStock(),
                p.getImages().stream().map(ProductImage::getUrl).toList(),
                p.getTags().stream().map(ApiController::toTagDto).toList(),
                p.isActive(),
                p.isArchived(),
                soldCount
        );
    }

    private static TagDto toTagDto(Tag tag) {
        return new TagDto(tag.uuid(), tag.getName());
    }

    private List<Tag> resolveTags(List<UUID> tagIds) {
        if (tagIds == null || tagIds.isEmpty()) return List.of();
        var ids = tagIds.stream()
            .filter(id -> id != null)
            .map(UuidUtil::toBytes)
            .toList();
        return tagRepository.findAllById(ids);
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
            o.getTrackingNumber(),
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

    @ResponseStatus(HttpStatus.BAD_REQUEST)
    private static class BadRequest extends RuntimeException {
        BadRequest(String m) {
            super(m);
        }
    }
}
