package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.TagDto;
import com.maxsolch.shop.web.dto.TagUpsertRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/tags")
@RequiredAdmin
@io.swagger.v3.oas.annotations.tags.Tag(name = "Admin Tags", description = "Admin tag management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminTagController {

    private final TagRepository tagRepository;

    public AdminTagController(TagRepository tagRepository) {
        this.tagRepository = tagRepository;
    }

    @GetMapping
    @Operation(summary = "List tags")
    public List<TagDto> list() {
        return tagRepository.findAllByOrderByNameAsc().stream()
                .map(t -> new TagDto(UuidUtil.toString(t.getId()), t.getName()))
                .toList();
    }

    @PostMapping
    @CacheEvict(value = "tags", allEntries = true)
    @Operation(summary = "Create tag")
    public TagDto create(@Valid @RequestBody TagUpsertRequest req) {
        if (tagRepository.findByName(req.name().trim()).isPresent()) {
            throw new BadRequestException("tag already exists");
        }
        Tag tag = new Tag();
        tag.setName(req.name().trim());
        Tag saved = tagRepository.save(tag);
        return new TagDto(UuidUtil.toString(saved.getId()), saved.getName());
    }

    @PatchMapping("/{id}")
    @CacheEvict(value = "tags", allEntries = true)
    @Operation(summary = "Rename tag")
    public TagDto update(@PathVariable String id, @Valid @RequestBody TagUpsertRequest req) {
        Tag tag = load(id);
        tag.setName(req.name().trim());
        return new TagDto(UuidUtil.toString(tag.getId()), tagRepository.save(tag).getName());
    }

    @DeleteMapping("/{id}")
    @CacheEvict(value = {"tags", "products", "productById"}, allEntries = true)
    @Operation(summary = "Delete tag")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        tagRepository.delete(load(id));
        return ResponseEntity.noContent().build();
    }

    private Tag load(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("invalid id");
        }
        return tagRepository.findById(key).orElseThrow(() -> new NotFoundException("tag not found"));
    }
}
