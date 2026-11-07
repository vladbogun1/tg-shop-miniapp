-- Встроенный ИИ, Э1: предупреждения владельцу (push) — каждое событие один раз за период. Замок — уникальный ключ:
-- INSERT IGNORE вернул 1 строку = этот экземпляр бэкенда первым отметил порог и шлёт push, 0 = уже отправлено.
-- Только добавляет таблицу. Убрать при желании: DROP TABLE ai_alerts;
CREATE TABLE ai_alerts (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    period     VARCHAR(16)  NOT NULL,
    threshold  VARCHAR(32)  NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_alerts (period, threshold)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
