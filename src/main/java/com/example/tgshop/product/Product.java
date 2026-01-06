package com.example.tgshop.product;

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
@Table(name = "products")
public class Product {

  @Id
  @Column(name = "id", columnDefinition = "BINARY(16)")
  private byte[] id;

  @Column(nullable = false)
  private String title;

  @Column(columnDefinition = "TEXT")
  private String description;

  @Column(name = "price_minor", nullable = false)
  private long priceMinor;

  @Column(nullable = false)
  private String currency = "UAH";

  @Column(nullable = false)
  private int stock;

  @Column(nullable = false)
  private boolean active = true;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @ToString.Exclude
  @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
  @OrderBy("sortOrder ASC")
  private List<ProductImage> images = new ArrayList<>();

  @PrePersist
  void prePersist() {
    if (id == null) id = UuidUtil.toBytes(UUID.randomUUID());
    if (createdAt == null) createdAt = Instant.now();
  }

  public java.util.UUID uuid() { return UuidUtil.fromBytes(id); }
}
