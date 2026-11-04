-- Память поставщика для «Поставки с ИИ» (04.11.2026): как строка накладной / заказа Taobao у этого поставщика
-- называется в нашем каталоге. Ключ — нормализованный текст строки (нижний регистр, одиночные пробелы), его
-- считает админка. Следующая поставка от того же поставщика сопоставляется по этой таблице без ИИ.
-- Только добавляет таблицу: старый бэкенд её не читает, откат — образами. Убрать при желании:
--   DROP TABLE supplier_aliases;
CREATE TABLE supplier_aliases (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    supplier_id BIGINT       NOT NULL,
    source_key  VARCHAR(255) NOT NULL,
    product_id  BINARY(16)   NOT NULL,
    variant_id  BINARY(16)   NULL,
    updated_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY ux_supplier_aliases_key (supplier_id, source_key),
    CONSTRAINT fk_supplier_aliases_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
