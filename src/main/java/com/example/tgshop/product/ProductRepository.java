package com.example.tgshop.product;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ProductRepository extends JpaRepository<Product, byte[]> {

  @Query("select distinct p from Product p left join fetch p.images where p.active = true order by p.createdAt desc")
  List<Product> findActiveWithImages();
}
