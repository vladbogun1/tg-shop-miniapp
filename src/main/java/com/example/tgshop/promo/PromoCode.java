package com.example.tgshop.promo;

import com.example.tgshop.common.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "promo_codes")
public class PromoCode {

  @Id
  @Column(name = "id", columnDefinition = "BINARY(16)")
  private byte[] id;

  @Column(nullable = false, length = 64)
  private String code;

  @Column(name = "discount_percent", nullable = false)
  private int discountPercent;

  @Column(name = "max_uses")
  private Integer maxUses;

  @Column(name = "uses_count", nullable = false)
  private int usesCount;

  @Column(nullable = false)
  private boolean active = true;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @PrePersist
  void prePersist() {
    if (id == null) id = UuidUtil.toBytes(UUID.randomUUID());
    if (createdAt == null) createdAt = Instant.now();
  }

  public UUID uuid() {
    return UuidUtil.fromBytes(id);
  }
}
