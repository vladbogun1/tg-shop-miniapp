package com.example.tgshop.media;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public interface MediaImageRepository extends JpaRepository<MediaImage, Long> {

  Optional<MediaImage> findByFilename(String filename);

  @Modifying
  @Transactional
  @Query("delete from MediaImage mi where mi.productId = :productId")
  void deleteByProductId(@Param("productId") byte[] productId);
}
