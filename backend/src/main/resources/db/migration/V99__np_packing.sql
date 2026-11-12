-- ============================================================
--  Упаковка посылок Новой почты (2026-11-12): система ПОДСКАЗЫВАЕТ коробку, упаковщик ПОДТВЕРЖДАЕТ
--  настоящую одним нажатием, ТТН обновляется под неё, система ЗАПОМИНАЕТ, в какую коробку
--  шёл такой набор товаров. Плюс замер Новой почты после приёма (вес, объёмный вес, цена).
--
--  * np_boxes — каталог коробок и пакетов НП (docs/np-port/np-box-catalog.md) и свои коробки.
--    heights_mm — высоты по линиям сгиба через запятую, первая = полная; у пакета (BAG) пусто —
--    высота считается по толщине товаров. in_stock = «есть у нас»: из таких подбирается коробка.
--  * order_shipments.box_* — что подсказали и что подтвердил упаковщик; np_* — замер НП после приёма
--    (наши заявленные weight_g / *_mm / delivery_cost_minor не перезаписываются).
--  * np_packing_memory — «этот набор товаров шёл в эту коробку N раз». goods_sig = goods_key ТТН
--    (ShipmentStaleness.goodsKey: товар:вариант:штук, отсортировано, SHA-256 первые 16 байт hex).
--
--  Аддитивная: старый бэкенд (v3.62.0) новые таблицы и колонки не читает, настройка
--  novaposhta.boxPresets не тронута — откат только образами.
-- ============================================================

CREATE TABLE np_boxes (
    id             BINARY(16)   NOT NULL,
    code           VARCHAR(32)  NULL,
    name           VARCHAR(80)  NOT NULL,
    kind           VARCHAR(8)   NOT NULL DEFAULT 'BOX',
    length_mm      INT          NOT NULL,
    width_mm       INT          NOT NULL,
    heights_mm     VARCHAR(64)  NULL,
    tare_g         INT          NOT NULL DEFAULT 0,
    pack_minor     BIGINT       NOT NULL DEFAULT 0,
    pack_estimated TINYINT(1)   NOT NULL DEFAULT 0,
    in_stock       TINYINT(1)   NOT NULL DEFAULT 0,
    sort_order     INT          NOT NULL DEFAULT 0,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_np_boxes_code (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Каталог НП, снимок 12.11.2026. Размеры «для внесення в ТТН» в мм; цена упаковки в копейках.
-- В наличии — то, что сейчас в пресетах «Коробки» (1, 2, 5, 10 кг).
INSERT INTO np_boxes (id, code, name, kind, length_mm, width_mm, heights_mm, tare_g, pack_minor, pack_estimated, in_stock, sort_order) VALUES
    (UUID_TO_BIN(UUID()), 'np-0.5',      'Коробка 0,5 кг',          'BOX', 170,  120,  '90',              50,  1500, 1, 0, 10),
    (UUID_TO_BIN(UUID()), 'np-0.5-flat', 'Коробка плоская 0,5 кг',  'BOX', 240,  170,  '40',              40,  1500, 1, 0, 20),
    (UUID_TO_BIN(UUID()), 'np-1',        'Коробка 1 кг',            'BOX', 240,  170,  '90',              80,  1500, 0, 1, 30),
    (UUID_TO_BIN(UUID()), 'np-1-flat',   'Коробка плоская 1 кг',    'BOX', 340,  240,  '40',              70,  1500, 1, 0, 40),
    (UUID_TO_BIN(UUID()), 'np-2',        'Коробка 2 кг',            'BOX', 340,  240,  '90',              120, 1500, 0, 1, 50),
    (UUID_TO_BIN(UUID()), 'np-2-square', 'Коробка квадратная 2 кг', 'BOX', 240,  200,  '160',             120, 1500, 1, 0, 60),
    (UUID_TO_BIN(UUID()), 'np-3',        'Коробка 3 кг',            'BOX', 240,  240,  '200',             150, 2500, 1, 0, 70),
    (UUID_TO_BIN(UUID()), 'np-3-flat',   'Коробка плоская 3 кг',    'BOX', 340,  240,  '140',             150, 2500, 1, 0, 80),
    (UUID_TO_BIN(UUID()), 'np-5',        'Коробка 5 кг',            'BOX', 400,  240,  '200,130,80',      200, 4000, 0, 1, 90),
    (UUID_TO_BIN(UUID()), 'np-10',       'Коробка 10 кг',           'BOX', 400,  340,  '285,200,140,85',  350, 4000, 0, 1, 100),
    (UUID_TO_BIN(UUID()), 'np-15',       'Коробка 15 кг',           'BOX', 600,  350,  '285,190,130,90',  450, 5500, 1, 0, 110),
    (UUID_TO_BIN(UUID()), 'np-20',       'Коробка 20 кг',           'BOX', 470,  400,  '420,310,210,100', 600, 6500, 1, 0, 120),
    (UUID_TO_BIN(UUID()), 'np-30',       'Коробка 30 кг',           'BOX', 700,  400,  '420,280,140',     900, 8000, 1, 0, 130),
    (UUID_TO_BIN(UUID()), 'np-tube-60',  'Тубус 60 см',             'BOX', 600,  160,  '120',             120, 2500, 1, 0, 140),
    (UUID_TO_BIN(UUID()), 'np-long-80',  'Длинная коробка 80 см',   'BOX', 800,  240,  '200',             300, 4000, 1, 0, 150),
    (UUID_TO_BIN(UUID()), 'np-tube-120', 'Тубус 120 см',            'BOX', 1200, 140,  '110',             200, 3500, 1, 0, 160),
    (UUID_TO_BIN(UUID()), 'np-bag-05',   'Пакет фирменный 0,5 кг',  'BAG', 250,  235,  NULL,              10,  500,  1, 0, 170),
    (UUID_TO_BIN(UUID()), 'np-bag-1',    'Пакет фирменный 1 кг',    'BAG', 360,  250,  NULL,              15,  500,  1, 0, 180),
    (UUID_TO_BIN(UUID()), 'np-bag-s',    'Пакет полиэтиленовый S',  'BAG', 490,  390,  NULL,              20,  500,  1, 0, 190),
    (UUID_TO_BIN(UUID()), 'np-bag-m',    'Пакет полиэтиленовый M',  'BAG', 700,  450,  NULL,              30,  800,  1, 0, 200),
    (UUID_TO_BIN(UUID()), 'np-bag-l',    'Пакет полиэтиленовый L',  'BAG', 900,  500,  NULL,              40,  1000, 1, 0, 210);

ALTER TABLE order_shipments
    ADD COLUMN box_suggested        VARCHAR(120) NULL,
    ADD COLUMN box_suggested_source VARCHAR(60)  NULL,
    ADD COLUMN box_label            VARCHAR(120) NULL,
    ADD COLUMN box_id               BINARY(16)   NULL,
    ADD COLUMN box_height_mm        INT          NULL,
    ADD COLUMN box_confirmed_at     TIMESTAMP    NULL,
    ADD COLUMN box_confirmed_by     VARCHAR(255) NULL,
    ADD COLUMN np_weight_g          INT          NULL,
    ADD COLUMN np_volume_weight_g   INT          NULL,
    ADD COLUMN np_factual_weight_g  INT          NULL,
    ADD COLUMN np_cost_minor        BIGINT       NULL,
    ADD COLUMN np_measured_at       TIMESTAMP    NULL;

-- Журнал упаковки читает последние ТТН по дате.
CREATE INDEX idx_order_shipments_created ON order_shipments (created_at);

CREATE TABLE np_packing_memory (
    goods_sig    VARCHAR(64)  NOT NULL,
    box_key      VARCHAR(120) NOT NULL,
    box_id       BINARY(16)   NULL,
    length_mm    INT          NULL,
    width_mm     INT          NULL,
    height_mm    INT          NULL,
    uses         INT          NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (goods_sig, box_key)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
