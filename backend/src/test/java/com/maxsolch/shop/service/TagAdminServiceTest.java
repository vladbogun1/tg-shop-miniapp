package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.dto.TagUpsertRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** SEO of the category page (V36): null keeps, blank clears, the journal gets only real changes. */
@ExtendWith(MockitoExtension.class)
class TagAdminServiceTest {

    @Mock TagRepository tagRepository;
    @Mock SlugService slugService;
    @Mock TranslationService translationService;

    TagAdminService service;
    Tag tag;
    String id;

    @BeforeEach
    void setUp() {
        service = new TagAdminService(tagRepository, slugService, translationService);
        tag = new Tag();
        tag.setId(UuidUtil.randomBytes());
        tag.setName("Коврики");
        tag.setSlug("kovriki");
        tag.setSeoTitle("Старый title");
        tag.setH1("Игровые коврики");
        id = UuidUtil.toString(tag.getId());
        when(tagRepository.findById(any())).thenReturn(Optional.of(tag));
        when(tagRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void seoFieldsAreSetClearedOrKept() {
        TagAdminService.Saved saved = service.update(id, new TagUpsertRequest("Коврики", null, null, null,
                " Новый title ", null, "", "Текст категории"));

        assertThat(saved.tag().seoTitle()).isEqualTo("Новый title");
        assertThat(saved.tag().seoDescription()).isNull();
        assertThat(saved.tag().h1()).isNull();
        assertThat(saved.tag().introText()).isEqualTo("Текст категории");
        assertThat(saved.seoChanged()).containsExactly("SEO title", "H1", "SEO-текст");
        assertThat(saved.tag().slug()).isEqualTo("kovriki");
    }

    @Test
    void oldStyleRequestKeepsTheSeo() {
        TagAdminService.Saved saved = service.update(id, new TagUpsertRequest("Коврики", null, 10, true));

        assertThat(saved.tag().seoTitle()).isEqualTo("Старый title");
        assertThat(saved.tag().h1()).isEqualTo("Игровые коврики");
        assertThat(saved.seoChanged()).isEmpty();
    }

    @Test
    void unchangedTextIsNotReportedAsChange() {
        TagAdminService.Saved saved = service.update(id, new TagUpsertRequest("Коврики", null, null, null,
                "Старый title", "", "Игровые коврики", ""));

        assertThat(saved.seoChanged()).isEmpty();
    }
}
