package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.TagDto;
import com.maxsolch.shop.web.dto.TagUpsertRequest;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Tags = the site's categories. Besides the name the admin sets the URL slug (blank = generated
 * from the name), the menu position and whether the category shows in the site menu.
 *
 * <p>Moved out of the controller so each change is one transaction: deleting a tag and deleting
 * its translations used to commit separately, so a failure between them left orphaned rows.
 *
 * <p>Every mutation evicts the product caches too: the product DTOs embed their tags, so a renamed
 * tag would otherwise show its old name/slug on product cards until the cache expired. The cache
 * advice wraps the transaction (see {@code TgShopApplication}), so the eviction lands after commit.
 */
@Service
public class TagAdminService {

    /** A saved tag plus the slug it had before (null for a new tag), for the site rebuild. */
    public record Saved(TagDto tag, String previousSlug) {
    }

    /** What a deleted tag was, for the journal and the site rebuild. */
    public record Deleted(String name, String slug) {
    }

    private final TagRepository tagRepository;
    private final SlugService slugService;
    private final TranslationService translationService;

    public TagAdminService(TagRepository tagRepository, SlugService slugService,
                           TranslationService translationService) {
        this.tagRepository = tagRepository;
        this.slugService = slugService;
        this.translationService = translationService;
    }

    @Transactional(readOnly = true)
    public List<TagDto> list() {
        return tagRepository.findAllByOrderByNameAsc().stream()
                .map(TagDto::of)
                .toList();
    }

    @Transactional
    @CacheEvict(value = {"tags", "products", "productById"}, allEntries = true)
    public Saved create(TagUpsertRequest req) {
        if (tagRepository.findByName(req.name().trim()).isPresent()) {
            throw new BadRequestException("tag already exists");
        }
        Tag tag = new Tag();
        tag.setName(req.name().trim());
        applySiteFields(tag, req);
        return new Saved(TagDto.of(tagRepository.save(tag)), null);
    }

    @Transactional
    @CacheEvict(value = {"tags", "products", "productById"}, allEntries = true)
    public Saved update(String id, TagUpsertRequest req) {
        Tag tag = load(id);
        String newName = req.name().trim();
        if (!newName.equalsIgnoreCase(tag.getName())
                && tagRepository.findByName(newName).isPresent()) {
            throw new BadRequestException("tag already exists");
        }
        String previousSlug = tag.getSlug();
        tag.setName(newName);
        applySiteFields(tag, req);
        return new Saved(TagDto.of(tagRepository.save(tag)), previousSlug);
    }

    @Transactional
    @CacheEvict(value = {"tags", "products", "productById"}, allEntries = true)
    public Deleted delete(String id) {
        Tag tag = load(id);
        Deleted deleted = new Deleted(tag.getName(), tag.getSlug());
        tagRepository.delete(tag);
        // content_translations has no FK (one table for every entity type) — clean up by hand,
        // in the same transaction as the tag itself.
        translationService.deleteForEntities(TranslationEntityType.TAG, List.of(tag.getId()));
        return deleted;
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
