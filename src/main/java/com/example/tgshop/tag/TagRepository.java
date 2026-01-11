package com.example.tgshop.tag;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TagRepository extends JpaRepository<Tag, byte[]> {
  Optional<Tag> findByNameIgnoreCase(String name);
}
