-- ============================================================
--  Нова пошта (перенос ветки np-integration на архитектуру v2, 2026-11-12).
--  Одна миграция = бывшие V65 + V66 + V67 ветки np-integration без изменений по смыслу.
--  Аддитивная: откат — только образами (старый бэкенд новые колонки и таблицы не читает).
-- ============================================================

-- ---------------- бывшая V65__nova_poshta ----------------
-- ============================================================
--  Нова пошта: вес/габариты, доставка курьером/в поштомат, ТТН и трекинг
--  (docs/NOVA-POSHTA-PLAN.md, этапы 0–4).
--
--  * products / product_variants / categories — вес (г) и габариты упаковки (мм); NULL = взять
--    у варианта → товара → категории (вверх по дереву) → настройки «по умолчанию».
--  * nova_poshta_warehouses.max_weight_kg — лимит веса места (PlaceMaxWeightAllowed), для поштоматов.
--  * orders.np_service_type — как доставить по НП: WAREHOUSE (отделение/пункт) | POSTOMAT | DOORS
--    (курьер на адрес). delivery_method остаётся NOVA_POSHTA/PICKUP, чтобы старый бэкенд при откате
--    читал новые заказы. NULL у старых заказов = WAREHOUSE.
--  * orders.np_street_* / np_building / np_flat — адрес для курьера.
--  * orders.recipient_last/first/middle_name — ФИО получателя раздельно (для ТТН); customer_name
--    остаётся «Прізвище Ім'я».
--  * orders.payment_on_delivery — «Оплата при отриманні»: 0 ₴ онлайн, вся сумма через «Контроль оплати».
--  * payment_options.kind / delivery_methods — тип варианта (NULL = онлайн, как раньше; ON_DELIVERY)
--    и для каких способов доставки он показывается (CSV WAREHOUSE,POSTOMAT,DOORS,PICKUP; NULL = все).
--    Вариант «Оплата при отриманні» засеян НЕактивным: виден покупателю, когда он включён в «Оплате»
--    и включена настройка payment.onDeliveryEnabled (старый бэкенд неактивные варианты не показывает).
--  * order_shipments — ТТН заказа и её последний статус в НП (одна активная на заказ, unique ниже).
--  * np_webhook_events — идемпотентность вебхуков нового API (UUID из x-np-attempt).
--
--  Аддитивная: откат — только образами.
-- ============================================================

ALTER TABLE products
    ADD COLUMN weight_g INT NULL,
    ADD COLUMN length_mm INT NULL,
    ADD COLUMN width_mm INT NULL,
    ADD COLUMN height_mm INT NULL;

ALTER TABLE product_variants
    ADD COLUMN weight_g INT NULL,
    ADD COLUMN length_mm INT NULL,
    ADD COLUMN width_mm INT NULL,
    ADD COLUMN height_mm INT NULL;

ALTER TABLE categories
    ADD COLUMN weight_g INT NULL,
    ADD COLUMN length_mm INT NULL,
    ADD COLUMN width_mm INT NULL,
    ADD COLUMN height_mm INT NULL;

ALTER TABLE nova_poshta_warehouses
    ADD COLUMN max_weight_kg INT NULL;

ALTER TABLE orders
    ADD COLUMN np_service_type VARCHAR(16) NULL AFTER np_warehouse_name,
    ADD COLUMN np_street_ref VARCHAR(64) NULL AFTER np_service_type,
    ADD COLUMN np_street_name VARCHAR(255) NULL AFTER np_street_ref,
    ADD COLUMN np_building VARCHAR(32) NULL AFTER np_street_name,
    ADD COLUMN np_flat VARCHAR(32) NULL AFTER np_building,
    ADD COLUMN recipient_last_name VARCHAR(128) NULL AFTER customer_name,
    ADD COLUMN recipient_first_name VARCHAR(128) NULL AFTER recipient_last_name,
    ADD COLUMN recipient_middle_name VARCHAR(128) NULL AFTER recipient_first_name,
    ADD COLUMN payment_on_delivery TINYINT(1) NOT NULL DEFAULT 0 AFTER prepayment_minor;

ALTER TABLE payment_options
    ADD COLUMN kind VARCHAR(16) NULL,
    ADD COLUMN delivery_methods VARCHAR(128) NULL;

-- Засеян НЕактивным: старый бэкенд (откат образами) не знает kind и показал бы его всем как
-- «без предоплаты». Включается в «Оплате» вместе с настройкой payment.onDeliveryEnabled.
INSERT INTO payment_options (id, title, description, requires_prepayment, prepayment_minor, sort_order, active, kind,
                             delivery_methods)
SELECT UNHEX('33333333333333333333333333333333'),
       'Оплата при получении',
       'Без оплаты онлайн: вся сумма при получении на Новой почте (наличными или картой).',
       FALSE, 0, 3, FALSE, 'ON_DELIVERY', 'WAREHOUSE,POSTOMAT,DOORS'
 WHERE NOT EXISTS (SELECT 1 FROM payment_options WHERE id = UNHEX('33333333333333333333333333333333'));

INSERT INTO content_translations (entity_type, entity_id, field, locale, text, source_hash, origin)
SELECT 'PAYMENT_OPTION', p.id, t.field, t.locale, t.text,
       SHA2(CASE t.field WHEN 'title' THEN p.title ELSE p.description END, 256), 'MANUAL'
  FROM payment_options p
  JOIN (
        SELECT 'title' AS field, 'uk' AS locale, 'Оплата при отриманні' AS text
        UNION ALL SELECT 'description', 'uk',
               'Без оплати онлайн: уся сума при отриманні на Новій пошті (готівкою або карткою).'
        UNION ALL SELECT 'title', 'en', 'Pay on delivery'
        UNION ALL SELECT 'description', 'en',
               'No online payment: the whole amount on delivery at Nova Poshta (cash or card).'
       ) t
 WHERE p.id = UNHEX('33333333333333333333333333333333')
ON DUPLICATE KEY UPDATE text = VALUES(text), source_hash = VALUES(source_hash), origin = 'MANUAL';

CREATE TABLE order_shipments (
    id                  BINARY(16)   NOT NULL,
    order_id            BINARY(16)   NOT NULL,
    carrier             VARCHAR(16)  NOT NULL DEFAULT 'NOVA_POSHTA',
    -- API = создана нашим ключом (есть np_ref), MANUAL = номер ввёл админ / создана в кабинете.
    origin              VARCHAR(16)  NOT NULL,
    ttn                 VARCHAR(32)  NOT NULL,
    np_ref              VARCHAR(64)  NULL,
    service_type        VARCHAR(16)  NULL,
    -- CREATED | IN_TRANSIT | ARRIVED | RECEIVED | REFUSED | RETURNING | CANCELLED | NOT_FOUND
    stage               VARCHAR(16)  NOT NULL,
    status_code         VARCHAR(8)   NULL,
    status_text         VARCHAR(255) NULL,
    weight_g            INT          NULL,
    length_mm           INT          NULL,
    width_mm            INT          NULL,
    height_mm           INT          NULL,
    declared_minor      BIGINT       NULL,
    cod_minor           BIGINT       NOT NULL DEFAULT 0,
    payer_type          VARCHAR(16)  NULL,
    delivery_cost_minor BIGINT       NULL,
    scheduled_delivery  DATE         NULL,
    arrived_at          TIMESTAMP    NULL,
    received_at         TIMESTAMP    NULL,
    storage_paid_from   DATE         NULL,
    return_ttn          VARCHAR(32)  NULL,
    -- одноразовые уведомления покупателю
    arrival_notified_at TIMESTAMP    NULL,
    storage_notified_at TIMESTAMP    NULL,
    last_polled_at      TIMESTAMP    NULL,
    last_event_at       TIMESTAMP    NULL,
    poll_error          VARCHAR(500) NULL,
    active              TINYINT(1)   NOT NULL DEFAULT 1,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_order_shipments_order (order_id),
    KEY idx_order_shipments_ttn (ttn),
    KEY idx_order_shipments_poll (active, stage, last_polled_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Под трекинг попадают только свежие отправки Новой почтой: SHIPPED за последние 30 дней с номером
-- из 14 цифр (номера Укрпошты, самовывоз, давние посылки не трогаются). Первый статус такой строки
-- применяется «тихо» (order_shipments.quiet ниже): без уведомлений покупателю и без авто-«Доставлен».
INSERT INTO order_shipments (id, order_id, origin, ttn, stage, active)
SELECT UUID_TO_BIN(UUID()), o.id, 'MANUAL', TRIM(o.tracking_number), 'IN_TRANSIT', 1
  FROM orders o
 WHERE o.status = 'SHIPPED'
   AND o.delivery_method = 'NOVA_POSHTA'
   AND o.tracking_number IS NOT NULL
   AND TRIM(o.tracking_number) REGEXP '^[0-9]{14}$'
   AND COALESCE(o.shipped_at, o.created_at) >= NOW() - INTERVAL 30 DAY
   AND NOT EXISTS (SELECT 1 FROM order_shipments s WHERE s.order_id = o.id);

CREATE TABLE np_webhook_events (
    event_id    VARCHAR(64)  NOT NULL,
    ttn         VARCHAR(32)  NULL,
    received_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id),
    KEY idx_np_webhook_events_received (received_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------- бывшая V66__np_review_fixes ----------------
-- ============================================================
--  Нова пошта, правки по ревью 2026-10-23 (docs/np-review-2026-10-23.md).
--
--  * order_shipments: с какого отделения и собирать ли наложенный платёж (чтобы авто-«update» ТТН
--    при оплате/правке заказа отправлял то же, что админ выбрал при создании), тип груза
--    (Parcel/Documents), наша оценка цены доставки для сверки с CostOnSite, «тихий» первый статус
--    у строк бэкфилла V65, optimistic lock (version) для гонки опрос/вебхук и одна активная ТТН
--    на заказ (unique по сгенерированной колонке).
--  * nova_poshta_warehouses: категория (из Address.getWarehouseTypes), закрытые отделения
--    (WarehouseStatus / пропали из справочника), лимиты габаритов места на получение, когда
--    отделение последний раз пришло в синке.
--
--  Аддитивная: откат — только образами (старый бэкенд эти колонки не читает).
-- ============================================================

ALTER TABLE order_shipments
    ADD COLUMN sender_warehouse_ref VARCHAR(64) NULL,
    -- NULL у старых строк = как раньше: собирать, если cod_minor > 0
    ADD COLUMN collect_cod          TINYINT(1)  NULL,
    ADD COLUMN cargo_type           VARCHAR(16) NULL,
    ADD COLUMN estimate_minor       BIGINT      NULL,
    ADD COLUMN quiet                TINYINT(1)  NOT NULL DEFAULT 0,
    ADD COLUMN version              BIGINT      NOT NULL DEFAULT 0;

-- Строки бэкфилла V65 (ещё ни разу не опрошены): первый статус без уведомлений и переходов заказа.
UPDATE order_shipments
   SET quiet = 1
 WHERE origin = 'MANUAL' AND last_polled_at IS NULL AND status_code IS NULL;

-- Дубли активных ТТН (не должны быть, но unique ниже иначе не встанет): оставить самую новую.
UPDATE order_shipments s
  JOIN (SELECT order_id, MAX(created_at) AS newest
          FROM order_shipments
         WHERE active = 1
         GROUP BY order_id
        HAVING COUNT(*) > 1) d ON d.order_id = s.order_id
   SET s.active = 0
 WHERE s.active = 1 AND s.created_at < d.newest;

ALTER TABLE order_shipments
    ADD COLUMN active_order_id BINARY(16) GENERATED ALWAYS AS (IF(active = 1, order_id, NULL)) STORED,
    ADD UNIQUE KEY uq_order_shipments_active (active_order_id);

ALTER TABLE nova_poshta_warehouses
    ADD COLUMN category      VARCHAR(16) NULL,
    ADD COLUMN active        TINYINT(1)  NOT NULL DEFAULT 1,
    ADD COLUMN status        VARCHAR(32) NULL,
    ADD COLUMN max_length_mm INT         NULL,
    ADD COLUMN max_width_mm  INT         NULL,
    ADD COLUMN max_height_mm INT         NULL,
    ADD COLUMN seen_at       TIMESTAMP   NULL;

-- Категории известных типов; следующий синк перепишет их по Address.getWarehouseTypes.
UPDATE nova_poshta_warehouses
   SET category = CASE type
                      WHEN 'f9316480-5f2d-425d-bc2c-ac7cd29decf0' THEN 'POSTOMAT'
                      WHEN '95dc212d-479c-4ffb-a8ab-8c1b9073d0bc' THEN 'POSTOMAT'
                      WHEN '841339c7-591a-42e2-8233-7a0a00f0ed6f' THEN 'BRANCH'
                      WHEN '9a68df70-0267-42a8-bb5c-37f427e36ee4' THEN 'BRANCH'
                      WHEN '6f8c7162-4b72-4b0a-88e5-906948c6a92f' THEN 'POINT'
                      ELSE 'OTHER'
                  END
 WHERE category IS NULL;

CREATE INDEX idx_np_warehouses_city_active ON nova_poshta_warehouses (city_ref, active);

-- ---------------- бывшая V67__np_shipment_stale ----------------
-- ============================================================
--  Нова пошта: устаревшая ТТН (тест владельца 2026-10-24, заказ 88a3173b).
--
--  После печати этикетки Новая почта не даёт менять ТТН («Document is already printed»), а
--  ошибка авто-правки лежала в poll_error и стиралась следующим опросом. Теперь:
--  * printed_at   — когда этикетку печатали через нас (после печати — только удалить и создать заново);
--  * goods_key    — отпечаток состава заказа на момент ТТН (товар, вариант, количество);
--  * recipient_key — отпечаток получателя и адреса;
--  * sync_error   — почему авто-правка ТТН не прошла (опрос его не трогает).
--  Разница отпечатков с заказом = «ТТН устарела, пересоздайте».
--
--  Аддитивная: откат — только образами (старый бэкенд эти колонки не читает).
-- ============================================================

ALTER TABLE order_shipments
    ADD COLUMN printed_at    TIMESTAMP    NULL,
    ADD COLUMN goods_key     VARCHAR(64)  NULL,
    ADD COLUMN recipient_key VARCHAR(64)  NULL,
    ADD COLUMN sync_error    VARCHAR(500) NULL;

