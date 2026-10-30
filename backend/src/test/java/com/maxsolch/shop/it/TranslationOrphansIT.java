package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.support.domain.ReplyTemplate;
import com.maxsolch.shop.translation.app.TranslationAdminService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The daily sweep of translations whose entity is gone deletes exactly what the six {@code NOT IN (SELECT ...)} statements of
 * the translation module used to delete, now that each owner of a text says which of its ids are gone (step 9e, the
 * {@code TranslatableSource} SPI): live rows stay, dead ones of every swept type go, bot phrases are never swept.
 */
class TranslationOrphansIT extends AbstractMysqlIT {

    @Autowired
    TranslationAdminService service;

    private void row(String type, byte[] id) {
        jdbc.update("INSERT INTO content_translations (entity_type, entity_id, field, locale, text, source_hash) "
                + "VALUES (?, ?, 'name', 'uk', 'x', ?)", type, id, "0".repeat(64));
    }

    private static byte[] random() {
        return UuidUtil.toBytes(UUID.randomUUID().toString());
    }

    private boolean exists(String type, byte[] id) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM content_translations WHERE entity_type = ? AND entity_id = ?",
                Integer.class, type, id);
        return n != null && n > 0;
    }

    @Test
    void sweepsExactlyTheRowsWhoseEntityIsGone() {
        Product live = product(10_000, 5);
        byte[] liveTag = random();
        jdbc.update("INSERT INTO tags (id, name, slug) VALUES (?, ?, ?)", liveTag, "it-tag-" + UUID.randomUUID(), "it-" + UUID.randomUUID());
        jdbc.update("INSERT INTO reply_templates (title, body_ru) VALUES ('it', 'x')");
        Long templateId = jdbc.queryForObject("SELECT MAX(id) FROM reply_templates", Long.class);
        byte[] liveTemplate = ReplyTemplate.translationId(templateId);
        byte[] liveOption = UuidUtil.toBytes(paymentOptionId);

        List<Object[]> alive = new ArrayList<>(List.of(new Object[]{"PRODUCT", live.getId()}, new Object[]{"TAG", liveTag},
                new Object[]{"REPLY_TEMPLATE", liveTemplate}, new Object[]{"PAYMENT_OPTION", liveOption},
                new Object[]{"BOT_TEXT", random()}));
        List<Object[]> dead = List.of(new Object[]{"PRODUCT", random()}, new Object[]{"VARIANT", random()},
                new Object[]{"TAG", random()}, new Object[]{"CATEGORY", random()}, new Object[]{"PAYMENT_OPTION", random()},
                new Object[]{"REPLY_TEMPLATE", random()}, new Object[]{"REPLY_TEMPLATE", ReplyTemplate.translationId(987_654_321L)});
        alive.forEach(r -> row((String) r[0], (byte[]) r[1]));
        dead.forEach(r -> row((String) r[0], (byte[]) r[1]));

        assertThat(service.cleanupOrphans()).isGreaterThanOrEqualTo(dead.size());

        alive.forEach(r -> assertThat(exists((String) r[0], (byte[]) r[1])).as("alive " + r[0]).isTrue());
        dead.forEach(r -> assertThat(exists((String) r[0], (byte[]) r[1])).as("dead " + r[0]).isFalse());
    }
}
