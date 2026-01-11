package com.example.tgshop.tag;

import com.example.tgshop.common.UuidUtil;
import com.example.tgshop.product.Product;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
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
@Table(name = "tags")
public class Tag {

  @Id
  @Column(name = "id", columnDefinition = "BINARY(16)")
  private byte[] id;

  @Column(nullable = false, unique = true)
  private String name;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @ToString.Exclude
  @ManyToMany(mappedBy = "tags")
  private List<Product> products = new ArrayList<>();

  @PrePersist
  void prePersist() {
    if (id == null) id = UuidUtil.toBytes(UUID.randomUUID());
    if (createdAt == null) createdAt = Instant.now();
  }

  public UUID uuid() { return UuidUtil.fromBytes(id); }
}
