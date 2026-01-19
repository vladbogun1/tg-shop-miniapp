package com.example.tgshop.api;

import com.example.tgshop.api.dto.AdminLoginRequest;
import com.example.tgshop.api.dto.CreateOrderRequest;
import com.example.tgshop.api.dto.CreateProductRequest;
import com.example.tgshop.api.dto.CreatePromoCodeRequest;
import com.example.tgshop.api.dto.CreateTagRequest;
import com.example.tgshop.api.dto.OrderDto;
import com.example.tgshop.api.dto.OrderItemDto;
import com.example.tgshop.api.dto.ProductDto;
import com.example.tgshop.api.dto.ProductVariantDto;
import com.example.tgshop.api.dto.ProductVariantRequest;
import com.example.tgshop.api.dto.PromoCodeDto;
import com.example.tgshop.api.dto.TagDto;
import com.example.tgshop.api.dto.UpdateProductArchivedRequest;
import com.example.tgshop.api.dto.UpdateProductActiveRequest;
import com.example.tgshop.api.dto.UpdateProductRequest;
import com.example.tgshop.api.dto.UpdatePromoCodeRequest;
import com.example.tgshop.api.dto.UpdateTagRequest;
import com.example.tgshop.api.dto.PaymentTemplateDto;
import com.example.tgshop.api.dto.UpdatePaymentTemplateRequest;
import com.example.tgshop.config.AppProperties;
import com.example.tgshop.common.UuidUtil;
import com.example.tgshop.order.OrderService;
import com.example.tgshop.order.OrderItemRepository;
import com.example.tgshop.order.OrderRepository;
import com.example.tgshop.promo.PromoCode;
import com.example.tgshop.promo.PromoCodeRepository;
import com.example.tgshop.product.Product;
import com.example.tgshop.product.ProductImage;
import com.example.tgshop.product.ProductVariant;
import com.example.tgshop.product.ProductRepository;
import com.example.tgshop.security.TgInitDataValidator;
import com.example.tgshop.settings.PaymentTemplateDefaults;
import com.example.tgshop.settings.Setting;
import com.example.tgshop.settings.SettingRepository;
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
    private final PromoCodeRepository promoCodeRepository;
    private final SettingRepository settingRepository;


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

    @GetMapping("/admin/settings/payment-template")
    public PaymentTemplateDto getPaymentTemplate(@RequestParam(value = "initData", required = false) String initData,
                                                 @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword) {
        assertAdmin(initData, adminPassword);
        String html = settingRepository.findById(PaymentTemplateDefaults.PAYMENT_TEMPLATE_KEY)
            .map(Setting::getValue)
            .orElseGet(PaymentTemplateDefaults::defaultTemplate);
        return new PaymentTemplateDto(html);
    }

    @PutMapping("/admin/settings/payment-template")
    public PaymentTemplateDto updatePaymentTemplate(@RequestParam(value = "initData", required = false) String initData,
                                                    @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword,
                                                    @RequestBody @Valid UpdatePaymentTemplateRequest req) {
        assertAdmin(initData, adminPassword);
        String html = req.html().trim();
        settingRepository.save(new Setting(PaymentTemplateDefaults.PAYMENT_TEMPLATE_KEY, html));
        return new PaymentTemplateDto(html);
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
                req.promoCode(),
                req.items().stream()
                    .map(i -> new OrderService.Item(i.productId(), i.variantId(), i.quantity()))
                    .toList()
        );

        log.info("🛒 API Creating order for tgUserId={} items={}", v.userId(), cmd.items().size());
        try {
            var saved = orderService.createOrder(cmd);
            log.info("🛒 API Order created uuid={} totalMinor={}", saved.uuid(), saved.getTotalMinor());
            return new Object() {
                public final String orderId = saved.uuid().toString();
            };
        } catch (IllegalArgumentException ex) {
            log.warn("🛒 API Order rejected: {}", ex.getMessage());
            throw new BadRequest(ex.getMessage());
        }
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
        assertUniqueProductTitle(req.title(), null);
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
        applyVariants(p, req.variants());

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
        applyVariants(product, req.variants());

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
                p.getVariants().stream().map(ApiController::toVariantDto).toList(),
                p.isActive(),
                p.isArchived(),
                soldCount
        );
    }

    private static TagDto toTagDto(Tag tag) {
        return new TagDto(tag.uuid(), tag.getName());
    }

    private static ProductVariantDto toVariantDto(ProductVariant variant) {
        return new ProductVariantDto(variant.uuid(), variant.getName(), variant.getStock());
    }

    private void applyVariants(Product product, List<ProductVariantRequest> variants) {
        product.getVariants().clear();
        if (variants == null || variants.isEmpty()) return;
        int order = 0;
        int totalStock = 0;
        for (ProductVariantRequest req : variants) {
            if (req == null) continue;
            String name = String.valueOf(req.name()).trim();
            if (name.isBlank()) continue;
            var variant = new ProductVariant();
            variant.setProduct(product);
            variant.setName(name);
            variant.setStock(Math.max(0, req.stock()));
            variant.setSortOrder(order++);
            product.getVariants().add(variant);
            totalStock += variant.getStock();
        }
        product.setStock(totalStock);
    }

    private void assertUniqueProductTitle(String title, byte[] existingId) {
        if (title == null) return;
        String normalized = title.trim();
        if (existingId == null) {
            if (productRepository.existsByTitleIgnoreCase(normalized)) {
                throw new BadRequest("Product title must be unique");
            }
        } else if (productRepository.existsByTitleIgnoreCaseAndIdNot(normalized, existingId)) {
            throw new BadRequest("Product title must be unique");
        }
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
            o.getSubtotalMinor(),
            o.getDiscountMinor(),
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
            o.getPromoCode(),
            o.getCreatedAt(),
            o.getItems().stream()
                .map(i -> new OrderItemDto(
                    UuidUtil.fromBytes(i.getProductId()),
                    i.getVariantId() == null ? null : UuidUtil.fromBytes(i.getVariantId()),
                    i.getTitleSnapshot(),
                    i.getVariantNameSnapshot(),
                    i.getPriceMinorSnapshot(),
                    i.getQuantity()
                ))
                .toList()
        );
    }

    @GetMapping("/admin/promocodes")
    public List<PromoCodeDto> promoCodes(@RequestParam(value = "initData", required = false) String initData,
                                         @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword) {
        assertAdmin(initData, adminPassword);
        return promoCodeRepository.findAll().stream()
            .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
            .map(ApiController::toPromoDto)
            .toList();
    }

    @PostMapping("/admin/promocodes")
    @ResponseStatus(HttpStatus.CREATED)
    public PromoCodeDto createPromoCode(@RequestParam(value = "initData", required = false) String initData,
                                        @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword,
                                        @RequestBody @Valid CreatePromoCodeRequest req) {
        assertAdmin(initData, adminPassword);
        String code = normalizePromoCode(req.code());
        if (promoCodeRepository.existsByCodeIgnoreCase(code)) {
            throw new BadRequest("Promo code already exists");
        }
        PromoCode promo = new PromoCode();
        promo.setCode(code);
        promo.setDiscountPercent(req.discountPercent());
        promo.setDiscountAmountMinor(Math.max(0, req.discountAmountMinor()));
        promo.setMaxUses(req.maxUses());
        promo.setActive(req.active());
        var saved = promoCodeRepository.save(promo);
        return toPromoDto(saved);
    }

    @PatchMapping("/admin/promocodes/{promoId}")
    public PromoCodeDto updatePromoCode(@RequestParam(value = "initData", required = false) String initData,
                                        @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword,
                                        @PathVariable("promoId") String promoId,
                                        @RequestBody @Valid UpdatePromoCodeRequest req) {
        assertAdmin(initData, adminPassword);
        PromoCode promo = promoCodeRepository.findById(UuidUtil.toBytes(UUID.fromString(promoId)))
            .orElseThrow(() -> new NotFound("Promo code not found"));
        String code = normalizePromoCode(req.code());
        if (!promo.getCode().equalsIgnoreCase(code)
            && promoCodeRepository.existsByCodeIgnoreCase(code)) {
            throw new BadRequest("Promo code already exists");
        }
        promo.setCode(code);
        promo.setDiscountPercent(req.discountPercent());
        promo.setDiscountAmountMinor(Math.max(0, req.discountAmountMinor()));
        promo.setMaxUses(req.maxUses());
        promo.setActive(req.active());
        var saved = promoCodeRepository.save(promo);
        return toPromoDto(saved);
    }

    @DeleteMapping("/admin/promocodes/{promoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePromoCode(@RequestParam(value = "initData", required = false) String initData,
                                @RequestHeader(value = "X-Admin-Password", required = false) String adminPassword,
                                @PathVariable("promoId") String promoId) {
        assertAdmin(initData, adminPassword);
        promoCodeRepository.deleteById(UuidUtil.toBytes(UUID.fromString(promoId)));
    }

    private static PromoCodeDto toPromoDto(PromoCode promo) {
        return new PromoCodeDto(
            promo.uuid(),
            promo.getCode(),
            promo.getDiscountPercent(),
            promo.getDiscountAmountMinor(),
            promo.getMaxUses(),
            promo.getUsesCount(),
            promo.isActive(),
            promo.getCreatedAt()
        );
    }

    private static String normalizePromoCode(String raw) {
        if (raw == null) return "";
        return raw.trim().toUpperCase();
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
