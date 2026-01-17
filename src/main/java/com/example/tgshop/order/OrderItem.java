package com.example.tgshop.order;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "order_items")
public class OrderItem {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ToString.Exclude
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "order_id", nullable = false)
  private OrderEntity order;

  @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
  private byte[] productId;

  @Column(name = "title_snapshot", nullable = false)
  private String titleSnapshot;

  @Column(name = "price_minor_snapshot", nullable = false)
  private long priceMinorSnapshot;

  @Column(name = "variant_id", columnDefinition = "BINARY(16)")
  private byte[] variantId;

  @Column(name = "variant_name_snapshot", length = 128)
  private String variantNameSnapshot;

  @Column(nullable = false)
  private int quantity;
}
