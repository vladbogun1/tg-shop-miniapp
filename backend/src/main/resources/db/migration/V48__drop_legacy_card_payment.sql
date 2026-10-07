-- ============================================================
--  Хвосты старой оплаты переводом на карту и старой базы.
--  Оплата только онлайн (monobank) с V39; колонки и таблицы ниже
--  оставлялись ради отката на v3.8 — откат больше не нужен.
--
--  - orders.payment_claimed / payment_claimed_at — «клиент сообщил об оплате»
--    (V12), бэкенд их не читает и не пишет с V39;
--  - payment_requisites — реквизиты карты (V1), не читаются с V39;
--  - 'PAYMENT_REQUISITES' в content_translations.entity_type (V29): строки
--    удалены ещё в V39, здесь — повторно и убирается само значение ENUM;
--  - settings — key/value из V1 для переноса со старой базы (сейчас
--    настройки в shop_settings, V31);
--  - order_messages.width / height — всегда NULL, в коде не используются.
--
--  Безопасно повторно: колонки удаляются только если есть (в MySQL нет
--  DROP COLUMN IF EXISTS), таблицы — DROP TABLE IF EXISTS. FK, индексов,
--  триггеров и представлений на этих колонках/таблицах нет.
-- ============================================================

-- orders.payment_claimed
SET @ddl = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE orders DROP COLUMN payment_claimed', 'DO 0')
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_claimed');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- orders.payment_claimed_at
SET @ddl = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE orders DROP COLUMN payment_claimed_at', 'DO 0')
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_claimed_at');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- order_messages.width
SET @ddl = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE order_messages DROP COLUMN width', 'DO 0')
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_messages' AND COLUMN_NAME = 'width');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- order_messages.height
SET @ddl = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE order_messages DROP COLUMN height', 'DO 0')
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_messages' AND COLUMN_NAME = 'height');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Значение ENUM можно убрать, только когда строк с ним нет.
DELETE FROM content_translations WHERE entity_type = 'PAYMENT_REQUISITES';
ALTER TABLE content_translations
    MODIFY entity_type ENUM('PRODUCT','VARIANT','TAG','PAYMENT_OPTION') NOT NULL;

DROP TABLE IF EXISTS payment_requisites;
DROP TABLE IF EXISTS settings;
