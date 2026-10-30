package com.maxsolch.shop.review.app;

import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.order.app.OrderLines;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.review.app.ReviewDtos.AdminReview;
import com.maxsolch.shop.review.app.ReviewDtos.MyReview;
import com.maxsolch.shop.review.domain.ProductReview;
import com.maxsolch.shop.review.domain.ReviewStatus;
import com.maxsolch.shop.review.infra.ReviewStore;
import com.maxsolch.shop.review.infra.ReviewStore.ProductInfo;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Review rows to what the apps get (customer's own reviews, admin list), with the product and order line they are about. */
@Component
public class ReviewMapper {

    private final ReviewStore store;
    private final OrderLines orderLines;
    private final UserRepository users;

    public ReviewMapper(ReviewStore store, OrderLines orderLines, UserRepository users) {
        this.store = store;
        this.orderLines = orderLines;
        this.users = users;
    }

    ProductInfo infoOf(byte[] productId) {
        return store.productInfos(List.of(productId)).get(UuidUtil.toString(productId));
    }

    Map<Long, OrderItem> linesOf(List<ProductReview> list) {
        Set<Long> ids = list.stream().map(ProductReview::getOrderItemId)
                .filter(Objects::nonNull).collect(Collectors.toCollection(LinkedHashSet::new));
        if (ids.isEmpty()) {
            return new HashMap<>(); // a null orderItemId (order deleted) is looked up too — no Map.of()
        }
        return orderLines.findAll(ids).stream().collect(Collectors.toMap(OrderItem::getId, Function.identity()));
    }

    static String variantOf(OrderItem line) {
        return line == null ? null : line.getVariantNameSnapshot();
    }

    static String titleOf(OrderItem line, ProductInfo info) {
        if (info != null && info.title() != null) {
            return info.title();
        }
        return line == null ? null : line.getTitleSnapshot();
    }

    MyReview toMine(ProductReview r, OrderItem line, ProductInfo info) {
        return new MyReview(r.getId(), r.getOrderItemId() == null ? 0 : r.getOrderItemId(),
                r.getOrderId() == null ? null : UuidUtil.toString(r.getOrderId()),
                UuidUtil.toString(r.getProductId()), info == null ? null : info.slug(), titleOf(line, info),
                variantOf(line), info == null ? null : info.imageUrl(), r.getRating(), r.getText(),
                r.getStatus().name(), r.getStatus() == ReviewStatus.PENDING, r.getAdminReply(),
                r.getCreatedAt(), r.getPublishedAt());
    }

    List<MyReview> toMine(List<ProductReview> mine) {
        Map<Long, OrderItem> lines = linesOf(mine);
        Map<String, ProductInfo> infos = store.productInfos(mine.stream().map(ProductReview::getProductId).toList());
        return mine.stream()
                .map(r -> toMine(r, lines.get(r.getOrderItemId()), infos.get(UuidUtil.toString(r.getProductId()))))
                .toList();
    }

    List<AdminReview> toAdmin(List<ProductReview> list) {
        if (list.isEmpty()) {
            return List.of();
        }
        Map<Long, OrderItem> lines = linesOf(list);
        Map<String, ProductInfo> infos = store.productInfos(list.stream().map(ProductReview::getProductId).toList());
        Map<Long, User> people = new HashMap<>();
        users.findAllById(list.stream().map(ProductReview::getUserId).collect(Collectors.toSet()))
                .forEach(u -> people.put(u.getTelegramUserId(), u));
        return list.stream().map(r -> {
            OrderItem line = lines.get(r.getOrderItemId());
            ProductInfo info = infos.get(UuidUtil.toString(r.getProductId()));
            User u = people.get(r.getUserId());
            return new AdminReview(r.getId(), r.getStatus().name(), r.getRating(), r.getText(), r.getAuthorName(),
                    UuidUtil.toString(r.getProductId()), titleOf(line, info), info == null ? null : info.slug(),
                    variantOf(line), r.getOrderId() == null ? null : UuidUtil.toString(r.getOrderId()),
                    ReviewStore.shortId(r.getOrderId()), r.getUserId(), customerName(u), r.getAdminReply(),
                    r.getAdminReplyAt(), r.getCreatedAt(), r.getUpdatedAt(), r.getPublishedAt());
        }).toList();
    }

    private static String customerName(User u) {
        if (u == null) {
            return null;
        }
        String name = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                + (u.getLastName() == null ? "" : u.getLastName())).trim();
        if (u.getUsername() != null && !u.getUsername().isBlank()) {
            name = name.isEmpty() ? "@" + u.getUsername() : name + " (@" + u.getUsername() + ")";
        }
        return name.isEmpty() ? null : name;
    }
}
