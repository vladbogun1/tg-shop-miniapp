package com.example.tgshop.order;

import com.example.tgshop.common.UuidUtil;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Repository;

@Repository
public class OrderAdminQueryRepositoryImpl implements OrderAdminQueryRepository {

  @PersistenceContext
  private EntityManager entityManager;

  @Override
  public AdminOrderPageResult findAdminOrdersPage(
      String query,
      String status,
      LocalDate createdFrom,
      LocalDate createdTo,
      String sort,
      int page,
      int size
  ) {
    int safePage = Math.max(page, 0);
    int safeSize = Math.max(1, Math.min(size, 100));

    List<byte[]> ids = findPageIds(query, status, createdFrom, createdTo, sort, safePage, safeSize);
    long totalCount = countOrders(query, status, createdFrom, createdTo);
    long deliveredRevenueMinor = sumDeliveredRevenue(query, status, createdFrom, createdTo);
    long deliveredCount = countDeliveredOrders(query, status, createdFrom, createdTo);

    if (ids.isEmpty()) {
      return new AdminOrderPageResult(List.of(), totalCount, deliveredRevenueMinor, deliveredCount, "UAH");
    }

    List<OrderEntity> orders = entityManager.createQuery(
            "select distinct o from OrderEntity o left join fetch o.items where o.id in :ids",
            OrderEntity.class)
        .setParameter("ids", ids)
        .getResultList();

    Map<UUID, Integer> positionById = new java.util.HashMap<>();
    for (int i = 0; i < ids.size(); i++) {
      positionById.put(UuidUtil.fromBytes(ids.get(i)), i);
    }
    orders.sort(Comparator.comparingInt(order -> positionById.getOrDefault(order.uuid(), Integer.MAX_VALUE)));

    String currency = orders.stream()
        .map(OrderEntity::getCurrency)
        .filter(value -> value != null && !value.isBlank())
        .findFirst()
        .orElse("UAH");

    return new AdminOrderPageResult(orders, totalCount, deliveredRevenueMinor, deliveredCount, currency);
  }

  private List<byte[]> findPageIds(
      String query,
      String status,
      LocalDate createdFrom,
      LocalDate createdTo,
      String sort,
      int page,
      int size
  ) {
    CriteriaBuilder cb = entityManager.getCriteriaBuilder();
    CriteriaQuery<byte[]> cq = cb.createQuery(byte[].class);
    Root<OrderEntity> root = cq.from(OrderEntity.class);
    cq.select(root.get("id"));
    cq.where(buildPredicates(query, status, createdFrom, createdTo, cb, root));
    cq.orderBy(buildSort(sort, cb, root));

    TypedQuery<byte[]> typedQuery = entityManager.createQuery(cq);
    typedQuery.setFirstResult(page * size);
    typedQuery.setMaxResults(size);
    return typedQuery.getResultList();
  }

  private long countOrders(String query, String status, LocalDate createdFrom, LocalDate createdTo) {
    CriteriaBuilder cb = entityManager.getCriteriaBuilder();
    CriteriaQuery<Long> cq = cb.createQuery(Long.class);
    Root<OrderEntity> root = cq.from(OrderEntity.class);
    cq.select(cb.count(root));
    cq.where(buildPredicates(query, status, createdFrom, createdTo, cb, root));
    return entityManager.createQuery(cq).getSingleResult();
  }

  private long countDeliveredOrders(String query, String status, LocalDate createdFrom, LocalDate createdTo) {
    CriteriaBuilder cb = entityManager.getCriteriaBuilder();
    CriteriaQuery<Long> cq = cb.createQuery(Long.class);
    Root<OrderEntity> root = cq.from(OrderEntity.class);
    List<Predicate> predicates = new ArrayList<>(Arrays.asList(buildPredicates(query, status, createdFrom, createdTo, cb, root)));
    predicates.add(cb.equal(cb.upper(root.get("status")), "DELIVERED"));
    cq.select(cb.count(root));
    cq.where(predicates.toArray(Predicate[]::new));
    return entityManager.createQuery(cq).getSingleResult();
  }

  private long sumDeliveredRevenue(String query, String status, LocalDate createdFrom, LocalDate createdTo) {
    CriteriaBuilder cb = entityManager.getCriteriaBuilder();
    CriteriaQuery<Long> cq = cb.createQuery(Long.class);
    Root<OrderEntity> root = cq.from(OrderEntity.class);
    List<Predicate> predicates = new ArrayList<>(Arrays.asList(buildPredicates(query, status, createdFrom, createdTo, cb, root)));
    predicates.add(cb.equal(cb.upper(root.get("status")), "DELIVERED"));
    cq.select(cb.coalesce(cb.sum(root.<Long>get("totalMinor")), 0L));
    cq.where(predicates.toArray(Predicate[]::new));
    Long result = entityManager.createQuery(cq).getSingleResult();
    return result == null ? 0L : result;
  }

  private Predicate[] buildPredicates(
      String query,
      String status,
      LocalDate createdFrom,
      LocalDate createdTo,
      CriteriaBuilder cb,
      Root<OrderEntity> root
  ) {
    List<Predicate> predicates = new ArrayList<>();
    String normalizedQuery = query == null ? "" : query.trim();
    if (!normalizedQuery.isBlank()) {
      String like = "%" + normalizedQuery.toLowerCase(Locale.ROOT) + "%";
      List<Predicate> searchPredicates = new ArrayList<>();
      searchPredicates.add(cb.like(cb.lower(root.get("customerName")), like));
      searchPredicates.add(cb.like(cb.lower(root.get("phone")), like));
      searchPredicates.add(cb.like(cb.lower(root.get("address")), like));
      searchPredicates.add(cb.like(cb.lower(cb.coalesce(root.get("comment"), "")), like));
      searchPredicates.add(cb.like(cb.lower(cb.coalesce(root.get("tgUsername"), "")), like));
      searchPredicates.add(cb.like(cb.lower(cb.coalesce(root.get("trackingNumber"), "")), like));
      searchPredicates.add(cb.like(cb.lower(cb.coalesce(root.get("promoCode"), "")), like));

      parseUuid(normalizedQuery).ifPresent(uuid -> searchPredicates.add(cb.equal(root.get("id"), UuidUtil.toBytes(uuid))));
      parseLong(normalizedQuery).ifPresent(value -> searchPredicates.add(cb.equal(root.get("tgUserId"), value)));
      predicates.add(cb.or(searchPredicates.toArray(Predicate[]::new)));
    }

    String normalizedStatus = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
    if (!normalizedStatus.isBlank() && !"ALL".equals(normalizedStatus)) {
      predicates.add(cb.equal(cb.upper(root.get("status")), normalizedStatus));
    }

    ZoneId zone = ZoneId.systemDefault();
    if (createdFrom != null) {
      predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), createdFrom.atStartOfDay(zone).toInstant()));
    }
    if (createdTo != null) {
      predicates.add(cb.lessThan(root.get("createdAt"), createdTo.plusDays(1).atStartOfDay(zone).toInstant()));
    }

    return predicates.toArray(Predicate[]::new);
  }

  private List<Order> buildSort(String sort, CriteriaBuilder cb, Root<OrderEntity> root) {
    String normalized = sort == null ? "" : sort.trim();
    List<Order> orders = new ArrayList<>();
    boolean needsCreatedAtFallback = true;
    switch (normalized) {
      case "createdAtAsc" -> {
        orders.add(cb.asc(root.get("createdAt")));
        needsCreatedAtFallback = false;
      }
      case "totalDesc" -> orders.add(cb.desc(root.get("totalMinor")));
      case "totalAsc" -> orders.add(cb.asc(root.get("totalMinor")));
      case "customerAsc" -> orders.add(cb.asc(cb.lower(root.get("customerName"))));
      case "customerDesc" -> orders.add(cb.desc(cb.lower(root.get("customerName"))));
      case "statusAsc" -> orders.add(cb.asc(cb.lower(root.get("status"))));
      case "statusDesc" -> orders.add(cb.desc(cb.lower(root.get("status"))));
      default -> {
        orders.add(cb.desc(root.get("createdAt")));
        needsCreatedAtFallback = false;
      }
    }

    if (needsCreatedAtFallback) {
      orders.add(cb.desc(root.get("createdAt")));
    }
    return orders;
  }

  private java.util.Optional<UUID> parseUuid(String value) {
    try {
      return java.util.Optional.of(UUID.fromString(value));
    } catch (IllegalArgumentException e) {
      return java.util.Optional.empty();
    }
  }

  private java.util.Optional<Long> parseLong(String value) {
    try {
      return java.util.Optional.of(Long.parseLong(value));
    } catch (NumberFormatException e) {
      return java.util.Optional.empty();
    }
  }
}
