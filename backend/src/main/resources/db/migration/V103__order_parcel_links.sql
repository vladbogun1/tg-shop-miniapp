-- Связанные ТТН заказа (13.11.2026, исследование docs/np-returns-2026-11.md, этап B2):
-- ТТН возврата (CargoReturn), переадресации (Redirecting) и «легкого возврата» (LightReturnNumber),
-- которые Новая почта создаёт на основании нашей ТТН. Отдельная таблица, а не строки order_shipments:
-- там «одна активная ТТН на заказ», и строку возврата код принял бы за доставку и закрыл бы заказ.
-- Строки связей НИКОГДА не меняют статус заказа — только показываются и шлют подсказки продавцам.
-- Только добавляет: старый бэкенд после отката таблицу не видит.
CREATE TABLE order_parcel_links (
    id                BINARY(16)   NOT NULL,
    order_id          BINARY(16)   NOT NULL,
    -- наша исходная ТТН (order_shipments.id), на основании которой НП создала эту
    shipment_id       BINARY(16)   NOT NULL,
    -- RETURN | REDIRECT | LIGHT_RETURN
    kind              VARCHAR(16)  NOT NULL,
    ttn               VARCHAR(32)  NOT NULL,
    -- ShipmentStage: CREATED, IN_TRANSIT, ARRIVED, RECEIVED, ...
    stage             VARCHAR(16)  NOT NULL,
    status_code       VARCHAR(8)   NULL,
    status_text       VARCHAR(255) NULL,
    storage_paid_from DATE         NULL,
    arrived_at        TIMESTAMP    NULL,
    received_at       TIMESTAMP    NULL,
    last_polled_at    TIMESTAMP    NULL,
    poll_error        VARCHAR(500) NULL,
    -- до какой стадии продавцам уже написали (ARRIVED / RECEIVED): одно сообщение на стадию
    notified_stage    VARCHAR(16)  NULL,
    version           BIGINT       NOT NULL DEFAULT 0,
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_parcel_links_ttn (ttn),
    KEY idx_order_parcel_links_order (order_id),
    KEY idx_order_parcel_links_poll (stage, last_polled_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
