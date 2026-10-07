package com.maxsolch.shop.translation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ContentTranslationRepository extends JpaRepository<ContentTranslation, ContentTranslationId> {

    /** Every row of one language — the whole overlay is built from this single query. */
    @Query("select t from ContentTranslation t where t.id.locale = :locale")
    List<ContentTranslation> findByLocale(@Param("locale") String locale);

    /**
     * Translations of hard-deleted entities. Deliberately does NOT clear the persistence context: it
     * runs inside the admin's product save, whose managed entities must stay attached.
     */
    @Modifying
    @Query("delete from ContentTranslation t where t.id.entityType = :type and t.id.entityId in :ids")
    int deleteForEntities(@Param("type") TranslationEntityType type, @Param("ids") Collection<byte[]> ids);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from ContentTranslation t where t.id.locale = :locale")
    int deleteByLocale(@Param("locale") String locale);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from ContentTranslation t where t.id.locale = :locale and t.id.entityType = :type")
    int deleteByLocaleAndType(@Param("locale") String locale, @Param("type") TranslationEntityType type);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from ContentTranslation t where t.id.locale = :locale and t.id.entityType = :type "
            + "and t.id.entityId = :entityId")
    int deleteByLocaleAndEntity(@Param("locale") String locale, @Param("type") TranslationEntityType type,
                                @Param("entityId") byte[] entityId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from ContentTranslation t where t.id.locale = :locale and t.id.entityType = :type "
            + "and t.id.entityId = :entityId and t.id.field = :field")
    int deleteByLocaleAndEntityAndField(@Param("locale") String locale, @Param("type") TranslationEntityType type,
                                        @Param("entityId") byte[] entityId, @Param("field") String field);

    // ---- orphans: rows whose entity no longer exists (there are no FKs, see V21) -----------------

    @Modifying
    @Query(nativeQuery = true, value = "DELETE FROM content_translations WHERE entity_type = 'PRODUCT' "
            + "AND entity_id NOT IN (SELECT id FROM products)")
    int deleteOrphanProducts();

    @Modifying
    @Query(nativeQuery = true, value = "DELETE FROM content_translations WHERE entity_type = 'VARIANT' "
            + "AND entity_id NOT IN (SELECT id FROM product_variants)")
    int deleteOrphanVariants();

    @Modifying
    @Query(nativeQuery = true, value = "DELETE FROM content_translations WHERE entity_type = 'TAG' "
            + "AND entity_id NOT IN (SELECT id FROM tags)")
    int deleteOrphanTags();

    @Modifying
    @Query(nativeQuery = true, value = "DELETE FROM content_translations WHERE entity_type = 'PAYMENT_OPTION' "
            + "AND entity_id NOT IN (SELECT id FROM payment_options)")
    int deleteOrphanPaymentOptions();

    @Modifying
    @Query(nativeQuery = true, value = "DELETE FROM content_translations WHERE entity_type = 'REPLY_TEMPLATE' "
            + "AND entity_id NOT IN (SELECT UNHEX(LPAD(HEX(id), 32, '0')) FROM reply_templates)")
    int deleteOrphanReplyTemplates();

    @Query("select t from ContentTranslation t where t.id.entityType = :type and t.id.entityId = :id")
    List<ContentTranslation> findForEntity(@Param("type") TranslationEntityType type, @Param("id") byte[] id);

    @Query("select t from ContentTranslation t where t.id.entityType = :type")
    List<ContentTranslation> findByType(@Param("type") TranslationEntityType type);
}
