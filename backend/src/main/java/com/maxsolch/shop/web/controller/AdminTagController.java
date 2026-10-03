package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.SlugService;
import com.maxsolch.shop.site.SiteRevalidator;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
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

/**
 * Tags = the site's categories. Besides the name the admin sets the URL slug (blank = generated
 * from the name), the menu position and whether the category shows in the site menu.
 *
 * <p>Every mutation evicts the product caches too: the product DTOs embed their tags, so a renamed
 * tag would otherwise show its old name/slug on product cards until the cache expired.
 */
@RestController
@RequestMapping("/api/admin/tags")
@RequiredAdmin
@io.swagger.v3.oas.annotations.tags.Tag(name = "Admin Tags", description = "Admin tag management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminTagController {

    private final TagRepository tagRepository;
    private final AdminAuditService audit;
    private final SlugService slugService;
    private final SiteRevalidator siteRevalidator;
    private final TranslationService translationService;

    public AdminTagController(TagRepository tagRepository, AdminAuditService audit,
                              SlugService slugService, SiteRevalidator siteRevalidator,
                              TranslationService translationService) {
        this.tagRepository = tagRepository;
        this.audit = audit;
        this.slugService = slugService;
        this.siteRevalidator = siteRevalidator;
        this.translationService = translationService;
    }

    @GetMapping
    @Operation(summary = "List tags")
    public List<TagDto> list() {
        return tagRepository.findAllByOrderByNameAsc().stream()
                .map(TagDto::of)
                .toList();
    }

    @PostMapping
    @CacheEvict(value = {"tags", "products", "productById"}, allEntries = true)
    @Operation(summary = "Create tag")
    public TagDto create(@Valid @RequestBody TagUpsertRequest req) {
        if (tagRepository.findByName(req.name().trim()).isPresent()) {
            throw new BadRequestException("tag already exists");
        }
        Tag tag = new Tag();
        tag.setName(req.name().trim());
        applySiteFields(tag, req);
        Tag saved = tagRepository.save(tag);
        audit.record("TAG_CREATE", "TAG", UuidUtil.toString(saved.getId()), saved.getName());
        siteRevalidator.categoryChanged(saved.getSlug(), null);
        return TagDto.of(saved);
    }

    @PatchMapping("/{id}")
    @CacheEvict(value = {"tags", "products", "productById"}, allEntries = true)
    @Operation(summary = "Edit tag (name, slug, menu order, menu visibility)")
    public TagDto update(@PathVariable String id, @Valid @RequestBody TagUpsertRequest req) {
        Tag tag = load(id);
        String newName = req.name().trim();
        if (!newName.equalsIgnoreCase(tag.getName())
                && tagRepository.findByName(newName).isPresent()) {
            throw new BadRequestException("tag already exists");
        }
        String previousSlug = tag.getSlug();
        tag.setName(newName);
        applySiteFields(tag, req);
        Tag saved = tagRepository.save(tag);
        audit.record("TAG_UPDATE", "TAG", id,
                saved.getName() + ", slug " + saved.getSlug() + ", order " + saved.getSortOrder()
                        + (saved.isShowInMenu() ? "" : ", скрыт из меню"));
        siteRevalidator.categoryChanged(saved.getSlug(), previousSlug);
        return TagDto.of(saved);
    }

    @DeleteMapping("/{id}")
    @CacheEvict(value = {"tags", "products", "productById"}, allEntries = true)
    @Operation(summary = "Delete tag")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        Tag tag = load(id);
        audit.record("TAG_DELETE", "TAG", id, tag.getName());
        String slug = tag.getSlug();
        tagRepository.delete(tag);
        // content_translations has no FK (one table for every entity type) — clean up by hand.
        translationService.deleteForEntities(TranslationEntityType.TAG, List.of(tag.getId()));
        siteRevalidator.categoryChanged(slug, null);
        return ResponseEntity.noContent().build();
    }

    /** {@code null} = keep; blank slug = regenerate from the name; a typed slug must be free. */
    private void applySiteFields(Tag tag, TagUpsertRequest req) {
        if (req.slug() != null || tag.getSlug() == null) {
            String explicit = req.slug() == null ? "" : req.slug().trim();
            if (!explicit.isEmpty()) {
                String normalised = SlugService.slugify(explicit);
                if (normalised.isEmpty()) {
                    throw new BadRequestException("slug: допустимы латиница, цифры и дефис");
                }
                if (!normalised.equals(tag.getSlug()) && slugService.tagSlugTaken(normalised, tag.getId())) {
                    throw new BadRequestException("slug «" + normalised + "» уже занят другой категорией");
                }
                tag.setSlug(normalised);
            } else {
                tag.setSlug(slugService.forTag(null, tag.getName(), tag.getId()));
            }
        }
        if (req.sortOrder() != null) {
            tag.setSortOrder(req.sortOrder());
        }
        if (req.showInMenu() != null) {
            tag.setShowInMenu(req.showInMenu());
        }
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
