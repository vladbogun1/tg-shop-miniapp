package com.example.tgshop.api;

import com.example.tgshop.api.dto.CreateOrderRequest;
import com.example.tgshop.api.dto.CreateProductRequest;
import com.example.tgshop.api.dto.ProductDto;
import com.example.tgshop.config.AppProperties;
import com.example.tgshop.order.OrderService;
import com.example.tgshop.product.Product;
import com.example.tgshop.product.ProductImage;
import com.example.tgshop.product.ProductRepository;
import com.example.tgshop.security.TgInitDataValidator;
import jakarta.validation.Valid;
import java.util.List;

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

  @GetMapping("/products")
  public List<ProductDto> products() {
    return productRepository.findActiveWithImages().stream().map(ApiController::toDto).toList();
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
    return new Object() { public final String orderId = saved.uuid().toString(); };
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
  public ProductDto createProduct(@RequestParam("initData") String initData,
                                  @RequestBody @Valid CreateProductRequest req) {
    var v = initDataValidator.validate(initData);
    if (!v.ok()) throw new Unauthorized("Bad initData");
    if (!props.getTelegram().adminUserIdSet().contains(v.userId())) throw new Forbidden("Not admin");

    Product p = new Product();
    p.setTitle(req.title());
    p.setDescription(req.description());
    p.setPriceMinor(req.priceMinor());
    p.setCurrency(req.currency());
    p.setStock(req.stock());
    p.setActive(true);

    if (req.imageUrls() != null) {
      int i = 0;
      for (String url : req.imageUrls()) {
        var img = new ProductImage();
        img.setProduct(p);
        img.setUrl(url);
        img.setSortOrder(i++);
        p.getImages().add(img);
      }
    }

    var saved = productRepository.save(p);
    return toDto(saved);
  }

  private static ProductDto toDto(Product p) {
    return new ProductDto(
        p.uuid(),
        p.getTitle(),
        p.getDescription(),
        p.getPriceMinor(),
        p.getCurrency(),
        p.getStock(),
        p.getImages().stream().map(ProductImage::getUrl).toList()
    );
  }

  @ResponseStatus(HttpStatus.UNAUTHORIZED)
  private static class Unauthorized extends RuntimeException { Unauthorized(String m){ super(m);} }

  @ResponseStatus(HttpStatus.FORBIDDEN)
  private static class Forbidden extends RuntimeException { Forbidden(String m){ super(m);} }
}
