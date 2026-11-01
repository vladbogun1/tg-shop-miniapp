-- Откат (значения те же строки, поэтому старый бэкенд работает на VARCHAR без изменений;
-- обратно в ENUM нужно только если захотят вернуть схему. Прежние определения):
--   ALTER TABLE admin_users MODIFY role ENUM('ADMIN','SUPER_ADMIN') NOT NULL DEFAULT 'ADMIN';
--   ALTER TABLE analytics_daily MODIFY channel ENUM('MINIAPP','WEB') NOT NULL;
--   ALTER TABLE analytics_daily_visitors MODIFY channel ENUM('MINIAPP','WEB') NOT NULL;
--   ALTER TABLE client_events MODIFY channel ENUM('MINIAPP','WEB') NOT NULL DEFAULT 'MINIAPP';
--   ALTER TABLE content_translations
--       MODIFY entity_type ENUM('PRODUCT','VARIANT','TAG','PAYMENT_OPTION','REPLY_TEMPLATE','CATEGORY','BRAND','BOT_TEXT') NOT NULL,
--       MODIFY origin ENUM('AI','MANUAL') NOT NULL DEFAULT 'AI';
--   ALTER TABLE order_messages
--       MODIFY sender_type ENUM('CUSTOMER','ADMIN','SYSTEM') NOT NULL,
--       MODIFY type ENUM('TEXT','PHOTO','FILE','SYSTEM') NOT NULL DEFAULT 'TEXT';
--   ALTER TABLE orders
--       MODIFY delivery_method ENUM('NOVA_POSHTA','PICKUP') NOT NULL DEFAULT 'NOVA_POSHTA',
--       MODIFY source ENUM('MINIAPP','WEB','ADMIN') NOT NULL DEFAULT 'MINIAPP',
--       MODIFY status ENUM('NEW','APPROVED','SHIPPED','DELIVERED','REJECTED') NOT NULL DEFAULT 'NEW';
--   ALTER TABLE product_reviews MODIFY status ENUM('PENDING','PUBLISHED','HIDDEN') NOT NULL DEFAULT 'PENDING';
--   ALTER TABLE products
--       MODIFY card_status ENUM('DRAFT','AI_FILLED','READY') NOT NULL DEFAULT 'DRAFT',
--       MODIFY `condition` ENUM('NEW','MARKDOWN','USED') NOT NULL DEFAULT 'NEW';
--   ALTER TABLE spec_attributes MODIFY type ENUM('NUMBER','ENUM','MULTI','BOOL','TEXT') NOT NULL;
--   ALTER TABLE support_messages
--       MODIFY sender_type ENUM('CUSTOMER','ADMIN','SYSTEM') NOT NULL,
--       MODIFY type ENUM('TEXT','PHOTO','FILE','SYSTEM') NOT NULL DEFAULT 'TEXT';
--   ALTER TABLE support_threads
--       MODIFY last_sender ENUM('CUSTOMER','ADMIN','SYSTEM') NULL,
--       MODIFY status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN';
--   ALTER TABLE web_login_tokens
--       MODIFY status ENUM('PENDING','CONFIRMED','REJECTED','USED','EXPIRED') NOT NULL DEFAULT 'PENDING';
--
-- ENUM -> VARCHAR(32): новый статус/тип больше не требует ALTER, а Java-enum сверяется тестом
-- (EnumColumnsTest). Значения не меняются. ALGORITHM=COPY (смена типа, INPLACE невозможен):
-- таблица пересобирается, запись в неё блокируется на время копирования (LOCK=SHARED, чтение идёт).
-- Самая большая — client_events (~200 тыс. строк на проде); замер в docs/tech-debt-2026-10.md.
-- Одна команда на таблицу — одна пересборка. Порядок не важен, FK на эти колонки нет.

ALTER TABLE admin_users MODIFY role VARCHAR(32) NOT NULL DEFAULT 'ADMIN', ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE analytics_daily MODIFY channel VARCHAR(32) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE analytics_daily_visitors MODIFY channel VARCHAR(32) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE client_events MODIFY channel VARCHAR(32) NOT NULL DEFAULT 'MINIAPP', ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE content_translations
    MODIFY entity_type VARCHAR(32) NOT NULL,
    MODIFY origin VARCHAR(32) NOT NULL DEFAULT 'AI',
    ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE order_messages
    MODIFY sender_type VARCHAR(32) NOT NULL,
    MODIFY type VARCHAR(32) NOT NULL DEFAULT 'TEXT',
    ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE orders
    MODIFY delivery_method VARCHAR(32) NOT NULL DEFAULT 'NOVA_POSHTA',
    MODIFY source VARCHAR(32) NOT NULL DEFAULT 'MINIAPP',
    MODIFY status VARCHAR(32) NOT NULL DEFAULT 'NEW',
    ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE product_reviews MODIFY status VARCHAR(32) NOT NULL DEFAULT 'PENDING', ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE products
    MODIFY card_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    MODIFY `condition` VARCHAR(32) NOT NULL DEFAULT 'NEW',
    ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE spec_attributes MODIFY type VARCHAR(32) NOT NULL, ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE support_messages
    MODIFY sender_type VARCHAR(32) NOT NULL,
    MODIFY type VARCHAR(32) NOT NULL DEFAULT 'TEXT',
    ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE support_threads
    MODIFY last_sender VARCHAR(32) NULL,
    MODIFY status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    ALGORITHM=COPY, LOCK=SHARED;
ALTER TABLE web_login_tokens MODIFY status VARCHAR(32) NOT NULL DEFAULT 'PENDING', ALGORITHM=COPY, LOCK=SHARED;
