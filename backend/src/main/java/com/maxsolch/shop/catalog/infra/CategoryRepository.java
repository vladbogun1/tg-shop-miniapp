package com.maxsolch.shop.catalog.infra;

import com.maxsolch.shop.catalog.domain.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CategoryRepository extends JpaRepository<Category, byte[]> {

    Optional<Category> findBySlug(String slug);

    boolean existsBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, byte[] id);

    /** Of these ids, the ones that still exist (the translation sweep asks which rows lost their entity). */
    @org.springframework.data.jpa.repository.Query("select e.id from Category e where e.id in :ids")
    java.util.List<byte[]> existingIds(@org.springframework.data.repository.query.Param("ids") java.util.Collection<byte[]> ids);

    /** Of these ids, the ones still in the legacy tags table (before V52 categories were tags). */
    @org.springframework.data.jpa.repository.Query(nativeQuery = true, value = "SELECT id FROM tags WHERE id IN (:ids)")
    java.util.List<byte[]> existingTagIds(@org.springframework.data.repository.query.Param("ids") java.util.Collection<byte[]> ids);
}
