package com.example.tgshop.order;

import com.example.tgshop.common.UuidUtil;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "orders")
public class OrderEntity {

  @Id
  @Column(name = "id", columnDefinition = "BINARY(16)")
  private byte[] id;

  @Column(name = "total_minor", nullable = false)
  private long totalMinor;

  @Column(nullable = false)
  private String currency = "UAH";

  @Column(name = "customer_name", nullable = false)
  private String customerName;

  @Column(nullable = false)
  private String phone;

  @Column(nullable = false, length = 1024)
  private String address;

  @Column(length = 1024)
  private String comment;

  @Column(name = "tg_user_id", nullable = false)
  private long tgUserId;

  @Column(name = "tg_username")
  private String tgUsername;

  @Column(nullable = false)
  private String status = "NEW";

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @ToString.Exclude
  @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<OrderItem> items = new ArrayList<>();

  @PrePersist
  void prePersist() {
    if (id == null) id = UuidUtil.toBytes(UUID.randomUUID());
    if (createdAt == null) createdAt = Instant.now();
  }

  public UUID uuid() { return UuidUtil.fromBytes(id); }
}
