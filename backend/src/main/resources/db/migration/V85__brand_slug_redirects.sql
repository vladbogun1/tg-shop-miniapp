-- Старые адреса брендов: при смене slug бренда прежний slug остаётся здесь, и сайт отвечает на него 301
-- на новый (/catalog?brand=<старый> → ?brand=<новый>). Бренд удалён — строки уходят вместе с ним.
-- Только добавление новой таблицы: старый бэкенд её не видит (откат = образы).
CREATE TABLE brand_slug_redirects (
    old_slug   VARCHAR(160) NOT NULL,
    brand_id   BINARY(16)   NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (old_slug),
    KEY ix_brand_slug_redirects_brand (brand_id),
    CONSTRAINT fk_brand_slug_redirects_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
