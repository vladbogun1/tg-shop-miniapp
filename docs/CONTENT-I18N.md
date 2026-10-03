# Перевод контента (товары, варианты, категории, способы оплаты)

Решения владельца (2026-10-04):
- **Русский — источник истины.** Он лежит в основных таблицах (`products.title` и т.д.), как и раньше.
  Переводы — отдельный слой поверх, его можно удалить целиком без потери данных.
- Языки перевода: **uk**, **en**. Для `ru` переводов нет — отдаётся оригинал.
- Первый перевод делается вручную силами Claude (саб-агенты), **без** ключей API и расписаний.
  Механизм перевода в админке — следующий этап; таблица и эндпоинты ниже под него уже готовы.

## Схема — `V21__content_translations.sql`

```sql
CREATE TABLE content_translations (
    entity_type ENUM('PRODUCT','VARIANT','TAG','PAYMENT_OPTION') NOT NULL,
    entity_id   BINARY(16)  NOT NULL,
    field       VARCHAR(32) NOT NULL,   -- см. таблицу полей
    locale      VARCHAR(8)  NOT NULL,   -- 'uk' | 'en'
    text        TEXT        NOT NULL,
    source_hash CHAR(64)    NOT NULL,   -- SHA-256 (hex, lower) русского исходника на момент перевода
    origin      ENUM('AI','MANUAL') NOT NULL DEFAULT 'AI',
    updated_by  BIGINT      NULL,       -- telegram id админа (для MANUAL / импорта)
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (entity_type, entity_id, field, locale),
    KEY idx_ct_locale_type (locale, entity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| entity_type | поля (`field`) | исходник |
| --- | --- | --- |
| `PRODUCT` | `title`, `description`, `seo_title`, `seo_description` | `products.*` |
| `VARIANT` | `name` | `product_variants.name` |
| `TAG` | `name` | `tags.name` |
| `PAYMENT_OPTION` | `title`, `description` | `payment_options.*` |

**Почему одна общая таблица, а не `product_translations` + `tag_translations` + …**
Один механизм выгрузки/загрузки, один будущий экран в админке, одна проверка устаревания;
новая сущность (баннеры, тексты реквизитов) добавляется значением ENUM без новой таблицы.
Цена — нет FK: осиротевшие строки (сущность удалена) чистит `@Scheduled`-задача и сервисы
удаления. Все сущности уже на `BINARY(16)`, поэтому `entity_id` общий.

**Устаревание.** `source_hash = sha256(utf8(исходник как есть в БД, без trim))`. При чтении перевод
применяется, **только если хеш совпадает с текущим исходником**. Поменяли товар в админке —
перевод мгновенно перестаёт показываться (видно русский), а в выгрузке строка помечена `STALE`.
Устаревший текст покупателю не показывается никогда (в описаниях бывают цены и характеристики).

**Ручные правки.** `origin = MANUAL` — будущая автоматика такие строки не перезаписывает
(только при `force`). Текущий импорт пишет `AI`.

## Где применяется перевод

- Язык запроса — `Accept-Language` (оба фронта уже шлют его), через существующий `LocaleResolver`.
  `uk`/`en` → оверлей, иначе оригинал.
- Публичные эндпоинты: `/api/products`, `/api/products/{id}`, `/api/tags`, `/api/public/**`,
  `/api/payment-options` — названия, описания, имена вариантов и тегов.
- Кабинет покупателя (`/api/me/orders/**`): название позиции — перевод товара, если он есть и
  актуален, иначе снимок. **`order_items.title_snapshot` остаётся русским** — его видит продавец,
  список отгрузки и канал.
- Админка, бот-уведомления продавцу, канал — всегда русский оригинал.
- Поиск (`q`) ищет по русскому И по переводам всех языков сразу («килимок» находит «Ковер»).
- Кэши каталога ключуются по языку.
- slug не переводится (один адрес на все языки).

## Админ-эндпоинты (база для будущего механизма в админке)

- `GET /api/admin/translations/export?locale=uk&status=missing|stale|translated|all&entityType=`
  → `[{ entityType, entityId, field, source, sourceHash, status, text, origin }]` — только по
  активным неархивным товарам, их вариантам, всем тегам, активным способам оплаты.
- `PUT /api/admin/translations/import` `{ locale, origin?: 'AI'|'MANUAL', force?: bool, items: [{ entityType, entityId, field, sourceHash, text }] }`
  → `{ applied, skippedStale, skippedManual, notFound, invalid }`. Строка применяется, только если
  `sourceHash` равен хешу текущего исходника; `MANUAL`-строки не перезаписываются без `force`.
- `GET /api/admin/translations/stats` → по каждому языку: `translated / stale / missing` по типам.
- `DELETE /api/admin/translations?locale=&entityType=&entityId=` — точечный сброс.
- Всё пишет в журнал действий админа.

## Первый перевод (2026-10-04)

Выгрузка исходников → дедупликация по хешу (общие описания переводятся один раз) → пачки для
саб-агентов с глоссарием (`docs/i18n-glossary.md`) → проверка (числа, латиница, переносы строк,
эмодзи сохранены; длина в разумных пределах) → импорт через `PUT /api/admin/translations/import`.
