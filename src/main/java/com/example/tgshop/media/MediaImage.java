package com.example.tgshop.media;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "media_images")
public class MediaImage {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "product_id", nullable = false, columnDefinition = "BINARY(16)")
  private byte[] productId;

  @Column(nullable = false, length = 255, unique = true)
  private String filename;

  @Column(name = "content_type", nullable = false, length = 128)
  private String contentType;

  @Lob
  @Column(nullable = false, columnDefinition = "LONGBLOB")
  private byte[] data;
}
