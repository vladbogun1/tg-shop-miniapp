-- Встроенный ИИ (07.11.2026): журнал внешних вызовов модуля ai — запрос к модели, веб-поиск, чтение страницы.
-- Сколько стоил и чем кончился (OK / EMPTY / FAILED). Из него считается расход за месяц и лимит, по нему видно,
-- что поисковик начал нас блокировать. Строки только добавляются.
-- Только добавляет таблицу: старый бэкенд её не читает, откат — образами. Убрать при желании:
--   DROP TABLE ai_usage;
CREATE TABLE ai_usage (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    created_at     TIMESTAMP(6) NOT NULL,
    feature        VARCHAR(32)  NOT NULL,
    kind           VARCHAR(16)  NOT NULL,
    provider       VARCHAR(64)  NOT NULL,
    result         VARCHAR(16)  NOT NULL,
    input_tokens   INT          NOT NULL DEFAULT 0,
    cached_tokens  INT          NOT NULL DEFAULT 0,
    output_tokens  INT          NOT NULL DEFAULT 0,
    cost_micro_usd BIGINT       NOT NULL DEFAULT 0,
    duration_ms    INT          NOT NULL DEFAULT 0,
    note           VARCHAR(255) NULL,
    PRIMARY KEY (id),
    KEY ix_ai_usage_created (created_at),
    KEY ix_ai_usage_provider (kind, provider, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
