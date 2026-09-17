-- ============================================================
--  Журнал действий администраторов.
--  Раньше нигде не фиксировалось, кто удалил заказ, кто снял оплату,
--  кто выдал скидку — а все сообщения в чате подписывались «Менеджер».
-- ============================================================

CREATE TABLE admin_audit_log (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    admin_id    BIGINT       NOT NULL,           -- telegram_user_id администратора
    admin_name  VARCHAR(255) NULL,               -- снимок имени на момент действия
    action      VARCHAR(64)  NOT NULL,           -- ORDER_STATUS / ORDER_DELETE / ORDER_PAID / ...
    entity_type VARCHAR(32)  NOT NULL,           -- ORDER / PRODUCT / PROMO / PAYMENT / ...
    entity_id   VARCHAR(64)  NULL,               -- UUID или иной идентификатор
    details     VARCHAR(1024) NULL,              -- человекочитаемое описание
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_created (created_at),
    KEY idx_audit_admin (admin_id, created_at),
    KEY idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
