package com.example.tgshop.product;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, byte[]> {

  @Query("select distinct p from Product p left join fetch p.images left join fetch p.tags left join fetch p.variants where p.active = true and p.archived = false order by p.createdAt desc")
  List<Product> findActiveWithImages();

  @Query("select distinct p from Product p left join fetch p.images left join fetch p.tags left join fetch p.variants where p.archived = false order by p.createdAt desc")
  List<Product> findAllWithImages();

  @Query("select distinct p from Product p left join fetch p.images left join fetch p.tags left join fetch p.variants where p.archived = true order by p.createdAt desc")
  List<Product> findArchivedWithImages();

  @Query("select p from Product p left join fetch p.images left join fetch p.tags left join fetch p.variants where p.id = :id")
  Optional<Product> findByIdWithImages(@Param("id") byte[] id);

  boolean existsByTitleIgnoreCase(String title);

  boolean existsByTitleIgnoreCaseAndIdNot(String title, byte[] id);
}
