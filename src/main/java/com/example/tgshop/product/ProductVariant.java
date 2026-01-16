package com.example.tgshop.product;

import com.example.tgshop.common.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "product_variants")
public class ProductVariant {

  @Id
  @Column(name = "id", columnDefinition = "BINARY(16)")
  private byte[] id;

  @ToString.Exclude
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "product_id", nullable = false)
  private Product product;

  @Column(nullable = false, length = 128)
  private String name;

  @Column(nullable = false)
  private int stock;

  @Column(name = "sort_order", nullable = false)
  private int sortOrder;

  @PrePersist
  void prePersist() {
    if (id == null) id = UuidUtil.toBytes(UUID.randomUUID());
  }

  public UUID uuid() {
    return UuidUtil.fromBytes(id);
  }
}
