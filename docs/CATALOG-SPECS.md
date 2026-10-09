# Каталог v2: категории, бренды, характеристики, фильтры и «оформление карточек» ИИ

Ветка `catalog-specs` (от master 3102933, 2026-10-09). Контракт для бэкенда, Mini App, сайта и админки.
Общие типы и движок фильтров — `shared/src/catalog.ts` (единственная реализация фильтрации/фасетов).
Черновик схемы и анализ данных прода — `.devdata/catalog-specs-2026-10-09/` (schema-draft.json, schema-notes.md, brands-draft.json).

## 0. Зачем и принятые решения

Сегодня «теги» — плоский список, товар может быть в нескольких, «Уценка» — тоже тег, характеристики — свободный текст
«• Ключ: значение» в описании (ключи разнобойные: «Основа/Основание/Подложка»). Фильтровать и сравнивать нельзя.

Решения (можно пересмотреть владельцем, но код строится под них):

1. **Категории — дерево из 2 уровней** (корень → подкатегория). Товар лежит **ровно в одной** категории-листе
   (в категорию, у которой есть дети, товар положить нельзя). Страница родителя показывает товары всех детей.
2. **Корней мало** (решение владельца 09.10): Мыши · Клавиатуры › Магнитные, Механические · Наушники › Полноразмерные, IEM ·
   Коврики › Тканевые, Стеклянные · Кейкапы · Глайды · Рукава · Кабели · Разное › Дуйки, Звуковые карты · Мебель › Кресла, Столы (пусто — скрыто)
   + виртуальная «Уценка». Плитки/картинки — только у корней (новых ассетов не нужно), подкатегории — деревом в левом списке под выбранным корнем.
   **Все старые slug'и сохраняются** → URL `/catalog/<slug>` не меняются, 301 не нужны. Новые: `klaviatury`, `kovriki-tkanevye`,
   `naushniki-polnorazmernye`, `raznoe`, `mebel`. `kovriki` и `naushniki` становятся родителями (их товары переезжают в `kovriki-tkanevye`
   и `naushniki-polnorazmernye`). Итоговая схема — `.devdata/catalog-specs-2026-10-09/schema-final.json`.
3. **«Уценка» — не категория, а состояние товара** `condition = NEW | MARKDOWN | USED` + `condition_note` (причина, необязательна).
   Адрес `/catalog/utsenka` остаётся **виртуальной подборкой** (все товары с condition ≠ NEW) — в меню сайта и последним чипом в Mini App.
4. **Бренды — справочник** `brands` (+ алиасы для распознавания), `products.brand_id`. Старое текстовое `products.brand` больше не читается кодом.
5. **Характеристики — строгая схема на категорию**: атрибуты с типом (`number`/`enum`/`multi`/`bool`/`text`), единицами, группами,
   флагами `filterable` (фасет), `comparable` (для будущего сравнения), `required` (нужно для «полной» карточки), `highlight` (строка на карточке).
   Подкатегория наследует атрибуты родителя; атрибуты без категории — глобальные (цвет).
   Значения товара — JSON `products.specs` (`{"weight_g":51,"sensor":"paw3950","connection":["wired","2_4ghz"],"dpi":{"min":50,"max":30000}}`),
   бэкенд валидирует его по схеме при каждой записи. `enum/multi` хранят slug опции (язык-нейтрально), подписи опций — ru/uk/en в схеме.
   `text` — только для моделей/названий (Omron D2FC-F-7N), не переводится и не фильтруется.
6. **Описание** становится маркетинговым текстом (лид + важные оговорки). Строки «• Ключ: значение» из описаний убираются —
   блок «Характеристики» рисуется из `specs`. Перевод описания — прежний поток «Переводы».
7. **Карточка товара имеет статус оформления** `card_status = DRAFT | AI_FILLED | READY`:
   новый товар — `DRAFT` («требует оформления»); после импорта ответа ИИ — `AI_FILLED` (видна уверенность по полям, источники, заметки ИИ);
   после проверки админом — `READY`. **На витрину статус не влияет** (товар продаётся сразу, как сейчас), это рабочая очередь админки.
   «Неполная» = не заполнены `required`-атрибуты (вычисляется, не хранится).
8. **Оформление через любую ИИ** — как «Переводы»: админка собирает промпт (наш формат + схема категорий + текущие данные товаров),
   админ копирует его в любую модель с поиском в интернете, вставляет ответ, админка проверяет (валидатор схемы), показывает
   дифф и уверенность, админ отмечает что принять → импорт. ИИ сама оценивает уверенность по каждому полю (0–100) и в целом.
9. Сравнение товаров сейчас **не делаем**, но всё для него есть (`comparable`, типизированные значения).
10. Старые таблицы `tags`/`product_tags` и колонка `products.brand` **не удаляются** в V52 (откат образа без восстановления БД);
    удаление — отдельной миграцией после выкатки на прод.

## 1. База (Flyway V52, V53)

`V52__catalog_v2.sql` — схема; `V53__catalog_v2_seed.sql` не нужен: категории/атрибуты/бренды заливаются **данными** (импорт схемы через
админ-API `PUT /api/admin/catalog/schema`, см. §3.4), чтобы на e2e/локали не тащить продовые справочники. Но перенос
существующих тегов в категории делается в V52 (иначе прод после выкатки остался бы без категорий):

```sql
CREATE TABLE categories (
  id BINARY(16) PK,              -- = id тега, из которого перенесена (переводы TAG копируются как CATEGORY)
  parent_id BINARY(16) NULL FK categories(id) ON DELETE RESTRICT,
  name VARCHAR(128) NOT NULL,   -- ru, уникально в пределах родителя
  slug VARCHAR(160) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0, show_in_menu TINYINT(1) NOT NULL DEFAULT 1,
  art_kind VARCHAR(32) NULL,     -- картинка плитки сайта: mouse|keyboard|keycaps|pad|glass|glides|headphones|iem|soundcard|sleeve|cable|blower|chair|desk|sale
  seo_title, seo_description, h1, intro_text  -- как у tags
  created_at, updated_at
);
INSERT INTO categories SELECT … FROM tags WHERE slug <> 'utsenka';   -- все теги, кроме «Уценки», 1:1
CREATE TABLE brands (id BINARY(16) PK, name VARCHAR(128) UNIQUE, slug VARCHAR(160) UNIQUE, aliases TEXT NULL /* через \n */,
                     website VARCHAR(255) NULL, sort_order INT DEFAULT 0, created_at, updated_at);
CREATE TABLE spec_groups (`key` VARCHAR(32) PK, label_ru, label_uk, label_en VARCHAR(64), sort_order INT);
CREATE TABLE spec_attributes (
  id BINARY(16) PK, category_id BINARY(16) NULL FK categories ON DELETE CASCADE,  -- NULL = глобальный
  `key` VARCHAR(48) NOT NULL,        -- snake_case, уникален в пределах «глобальные + путь категории» (проверяет сервис)
  label_ru, label_uk, label_en VARCHAR(96) NOT NULL,
  type ENUM('NUMBER','ENUM','MULTI','BOOL','TEXT') NOT NULL,
  unit_ru, unit_uk, unit_en VARCHAR(24) NULL,
  is_range TINYINT(1) DEFAULT 0, group_key VARCHAR(32) NOT NULL,
  filterable, comparable, required, highlight TINYINT(1),
  sort_order INT, buckets JSON NULL /* [{min,max,label_ru,label_uk,label_en}] */, hint TEXT NULL,
  UNIQUE (category_id, `key`)
);
CREATE TABLE spec_options (id BINARY(16) PK, attribute_id FK ON DELETE CASCADE, value VARCHAR(64), label_ru, label_uk, label_en VARCHAR(96),
                           aliases TEXT NULL, sort_order INT, UNIQUE(attribute_id, value));
ALTER TABLE products
  ADD category_id BINARY(16) NULL FK categories ON DELETE SET NULL,
  ADD brand_id BINARY(16) NULL FK brands ON DELETE SET NULL,
  ADD `condition` ENUM('NEW','MARKDOWN','USED') NOT NULL DEFAULT 'NEW',
  ADD condition_note VARCHAR(255) NULL,
  ADD specs JSON NULL,
  ADD card_status ENUM('DRAFT','AI_FILLED','READY') NOT NULL DEFAULT 'DRAFT',
  ADD card_confidence TINYINT NULL,           -- 0..100, общая уверенность ИИ из последнего импорта
  ADD card_meta JSON NULL;                    -- {fields:{key:{c:0..100,src?:url}}, sources:[url], notes, model?, importedAt, reviewedAt, reviewedBy}
-- перенос: category_id = первый тег товара, не «Уценка» (по sort_order, затем по имени); condition = MARKDOWN, если был тег utsenka.
-- content_translations.entity_type += 'CATEGORY','BRAND'; копия строк TAG → CATEGORY с тем же entity_id (поля name, seo_*, h1, intro_text).
-- Существующие товары: card_status = 'DRAFT' (все «требуют оформления» до прогона ИИ).
```

`condition_note` переводится через `content_translations` (PRODUCT, поле `condition_note`). Подписи атрибутов/опций/групп переводятся
прямо в схеме (их мало, правятся в редакторе категорий; при импорте схемы ИИ-черновика они уже есть на трёх языках).

## 2. Значения характеристик (`products.specs`)

| type | JSON | пример | фасет |
|---|---|---|---|
| number | число | `51` | бакеты (если заданы) или диапазон «от–до» |
| number + range | `{"min":a,"max":b}` | `{"min":50,"max":30000}` | пересечение диапазонов |
| enum | slug опции | `"paw3950"` | чипы (ИЛИ) |
| multi | массив slug'ов | `["wired","2_4ghz","bt"]` | чипы (ИЛИ: хотя бы одно) |
| bool | `true/false` | `true` | один чип «есть»; `false` ≠ «нет данных» |
| text | строка | `"Omron D2FC-F-7N"` | нет |

Нет ключа = неизвестно. Валидатор (бэкенд `SpecsValidator`, зеркально `frontend-admin/lib/card-check.ts`):
неизвестный ключ, опция не из списка (сначала пробуем алиасы, регистронезависимо), число не число / вне 0..1e7, min>max,
пустая строка — ошибка поля (поле отбрасывается, остальное сохраняется; в ответе API — список проблем).

## 3. API

Все ответы витрины локализуются как сейчас (Accept-Language / `?lang`, без заголовка — uk); опции/атрибуты отдаются **уже с подписью
на нужном языке**. Кэши Caffeine: `catalogSchema` (+ существующие `products`, `productById`); любая запись схемы/брендов/категорий их сбрасывает
и дёргает `siteRevalidator.allChanged()`.

### 3.1 Витрина

- `GET /api/catalog/schema` (Mini App, без авторизации как `/api/products`) и `GET /api/public/catalog/schema` (сайт) → `CatalogSchema`
  (`shared/src/catalog.ts`): все категории (с `productCount` по поддереву, только активные товары), бренды с товарами, группы, атрибуты, подписи состояний.
- Продукты (`/api/products`, `/api/products/{id}`, `/api/public/products*`) получают поля `CatalogFields`:
  `categoryId`, `brandRef {id,slug,name}`, `condition`, `conditionNote` (переведённая), `specs`. Поле `tags` **остаётся** в ответе, но собирается
  из категории: `[{id, name, slug}]` = путь категории (корень, лист) — старые клиенты/кэш не ломаются. `brand` (строка) = `brandRef.name`.
- `GET /api/public/products?category=<slug>` — по поддереву; `category=utsenka` — подборка condition≠NEW. Новый параметр `all=1`
  (без пагинации, для фасетов на стороне сайта; максимум 1000). Сайт фильтрует и считает фасеты сам через `shared/catalog.ts`.
  `view=card` — лёгкий элемент для списков (`id, slug, title, priceMinor, compareAtMinor, currency, stock, variants, images` (первые 2),
  `ratingAvg, ratingCount, soldCount, createdAt, categoryId, brandRef, condition, specs`; без описания, SEO, `conditionNote`, `tags`).
- `GET /api/public/categories` — как сейчас (плоско) + `parentId`, `artKind`; `productCount` по поддереву. Виртуальная «Уценка» добавляется
  последним элементом (`id:"utsenka"`, `parentId:null`, `artKind:"sale"`), если есть такие товары.
- `GET /api/public/categories/{slug}` — работает и для скрытых из меню (сейчас 404), и для `utsenka` (SEO из старого тега, если был, иначе шаблон).
- `/api/public/sitemap` — категории дерева (родители тоже), `utsenka` если не пусто.
- Поиск (`q`) дополнительно ищет по имени бренда.

### 3.2 Админка — категории, бренды, схема

`/api/admin/categories` GET (дерево плоским списком: всё из CatalogCategory + SEO + `productCountDirect`), POST, PATCH `{id}`, DELETE `{id}`
(409 `CATEGORY_HAS_PRODUCTS` / `CATEGORY_HAS_CHILDREN`), PATCH `/reorder` `[{id,parentId,sortOrder}]`. Правила: глубина ≤ 2;
нельзя сделать родителем категорию, где лежат товары (409 `CATEGORY_HAS_PRODUCTS`).

`/api/admin/brands` GET (с `productCount`), POST, PATCH, DELETE (товары → brand_id NULL), POST `/{id}/merge-into/{targetId}`.

`/api/admin/spec-attributes?categoryId=` GET (свои + унаследованные с флагом `inherited`), POST, PATCH, DELETE
(`?force=1` — удалить и вычистить ключ из specs товаров; без force при использовании → 409 `ATTRIBUTE_IN_USE {count}`),
опции — внутри атрибута (PATCH заменяет список; удаление используемой опции → 409 без force; `renameOption {from,to}` переписывает specs).
`GET /api/admin/spec-groups`, PUT (весь список).

`GET /api/admin/catalog/schema` → полная схема всех языков (для промпта и редактора). `PUT /api/admin/catalog/schema` — **импорт целиком**
(формат `schema-draft.json`: categories с `old_tag_slugs`, global_attributes, groups, conditions) — upsert по slug/key/value, ничего не удаляет;
используется для первичного наполнения и переноса стенд→прод.

### 3.3 Админка — товар

`ProductUpsertRequest`/`AdminProductDto`: `categoryId` (лист; `""` в PATCH — снять), `brandId` (`""` — снять; или `brandName` → найти
по имени/алиасу или создать), `condition`, `conditionNote`, `specs` (заменяет целиком; `null` — не трогать). `cardStatus` в запросе **игнорируется**: статус карточки меняют только
`cards/import` и `PATCH /products/{id}/card-status` (READY пишет `card_meta.reviewedAt/reviewedBy`). `tagIds` и `brand` убраны из запроса (игнорируются).
`AdminProductDto` дополнительно: `categoryId`, `brandRef {id,slug,name}`, `brand` (= brandRef.name), `condition`, `conditionNote`, `specs`,
`cardStatus`, `cardConfidence`, `cardMeta`, `missingRequired:[key]`, `unfinished` (V53), `tags` = путь категории `[{id,name,slug,sortOrder,showInMenu}]`.
Ответ на сохранение содержит `specIssues: [{key, reason, message}]` — что валидатор отбросил (reason — код: `UNKNOWN_KEY`, `UNKNOWN_OPTION`,
`NOT_A_NUMBER`, `OUT_OF_RANGE`, `MIN_GT_MAX`, `NOT_A_BOOL`, `NOT_A_STRING`, `NOT_A_LIST`, `EMPTY`, `TOO_LONG`). Смена категории без `specs`
перепроверяет сохранённые specs по новой схеме (лишние ключи уходят в `specIssues`). Аудит `PRODUCT_UPDATE` пишет изменения кратко
(«категория A › B → C, бренд X → Y, состояние NEW → MARKDOWN, характеристики: +3, ~2, −1, карточка DRAFT → READY»).
Любое ручное изменение specs статус карточки не меняет.

**Незавершённые товары (решение владельца 09.10):**
- `POST /api/admin/products` требует `title`, `priceMinor > 0`, `stock ≥ 0` и `categoryId` (лист) — иначе 400; фото, бренд, описание,
  характеристики необязательны. Новый товар **всегда** сохраняется скрытым (`active=false`), с `cardStatus=DRAFT` и `unfinished=true`, что бы ни пришло
  в `active`. `unfinished` (V53, «Незавершённые») снимается, когда товар становится активным любым путём или уходит в архив;
  у старых скрытых товаров он `false`.
- Публикация — переход `active: false → true` (`PATCH /products/{id}/active {active:true}` или `PATCH /products/{id}` с `active:true`):
  нет цены или категории → 409 `PRODUCT_NOT_PUBLISHABLE` с `missing: ["price","category"]` (force не обходит);
  карточка `DRAFT` → 409 `CARD_NOT_READY`, если не передан `?force=1` («выложить без оформления»). Уже активные товары не трогаются.

### 3.4 Админка — «Карточки» (оформление ИИ)

- `GET /api/admin/cards/stats` → `{draft, aiFilled, ready, incomplete, unfinished}` (бейдж в меню = draft + aiFilled).
  `incomplete` — активные неархивные товары без категории или с незаполненным required; `unfinished` («Незавершённые») —
  `products.unfinished = 1` и не в архиве.
- `GET /api/admin/cards/export?status=draft|ai_filled|ready|incomplete|unfinished|all&ids=<uuid,uuid>` → `[{id, title, slug, categoryId,
  categorySlug, brand, condition, conditionNote, description, specs, cardStatus, cardConfidence, cardMeta, missingRequired:[key],
  variants:[name], imageUrl, priceMinor, price, active, stock, unfinished}]` (`imageUrl` — ключ первого фото, как хранится; `price` — гривны).
- `PUT /api/admin/cards/import` `{items:[{productId, categorySlug?, brand?, specs?, confidence?:{key:0..100}, overall?, description?, sources?,
  notes?, model?, markReady?:boolean, title?, translations?:{uk?:{title?,description?,conditionNote?}, en?:{…}}, publish?:boolean,
  condition?, conditionNote?}], replaceSpecs:boolean}` →
  `{applied, rejected:[{productId, reason}], issues:[{productId, key, reason, message}], createdBrands:[name],
  items:[{productId, applied, published, reason?, translated:{uk:n, en:n}, skippedManual:n}]}`.
  Сервер повторно валидирует всё (клиентская проверка — только для UX). `replaceSpecs=false` (по умолчанию): ключи ответа перезаписывают,
  отсутствующие сохраняются. `title` / `description` (ru) меняются, только если пришли (занятое название → issue `TITLE_TAKEN`).
  Статус → `AI_FILLED`, если пришли specs/описание/название, или `READY` (`markReady`); только бренд/категория — статус не меняется.
  Смена категории — только на лист; неизвестный slug → issue `UNKNOWN_CATEGORY`, родитель → `CATEGORY_NOT_LEAF`.
  `translations` пишутся в `content_translations` (PRODUCT: title/description/condition_note, origin AI) от **итогового** русского текста
  (source_hash = SHA-256 сохранённого источника) в той же транзакции; MANUAL-переводы не перезаписываются (`skippedManual`); пустой/длинный
  текст → issue `INVALID_TEXT_BLANK` / `INVALID_TEXT_TOO_LONG`, нет русского источника → `NO_SOURCE`.
  `publish: true` — после применения сделать товар активным, если есть цена и категория и карточка не DRAFT; иначе `published:false`
  и `reason` (`NOT_PUBLISHABLE: price,category` / `CARD_NOT_READY`). Аудит `CARDS_IMPORT`. Журнал карточки — `card_meta`.
- `PATCH /api/admin/products/{id}/card-status` `{status}` — «Проверено» из списка/карточки (аудит `PRODUCT_CARD_STATUS`).

## 4. Промпт «Оформление карточек» (frontend-admin/lib/card-prompt.ts)

Пакет = до **8 товаров** (ИИ ищет в интернете — большие пакеты деградируют). В промпт входят: роль и магазин; задача; жёсткие правила
(«не выдумывать: нет надёжного источника — не заполняй поле», «значения enum/multi — только из списка, иначе `proposals`», «числа — в единицах схемы»,
«что делать с no-name: заполнить то, что видно из названия/описания/фото, остальное пропустить, confidence низкий»,
«описание: 1–3 абзаца на русском, деловой тон, без списка характеристик, сохранить оговорки об уценке/комплектации/состоянии»);
шкала уверенности (90–100 — официальный сайт/даташит производителя; 70–89 — крупный магазин/обзор, совпадает в 2 источниках;
40–69 — один неофициальный источник или вывод по аналогичной модели; <40 — догадка → лучше не заполнять); схема нужных категорий
(только атрибуты категорий товаров пакета: key, тип, единица, опции `value — подпись`, подсказка); список товаров (id `p` + 8 hex, название,
бренд, категория, варианты, текущее описание, текущие specs).

Ответ — один блок ```json:
```json
{
  "p0a1b2c3d": {
    "category": "myshki",
    "brand": "VGN",
    "specs": { "weight_g": 51, "sensor": "paw3950", "connection": ["wired","2_4ghz","bt"], "dpi": {"min": 50, "max": 30000} },
    "confidence": { "weight_g": 95, "sensor": 98, "connection": 90, "dpi": 90 },
    "overall": 92,
    "description": "VGN Dragonfly F2 Ultra+ — лёгкая беспроводная мышь…",
    "proposals": [ { "key": "sensor", "value": "PAW3950 Ultra", "why": "нет в списке" } ],
    "sources": ["https://vgnlab.com/products/f2-ultra-plus"],
    "notes": "Вес указан без кабеля."
  }
}
```
Проверка (card-check.ts): JSON как в переводах (ремонт висячих запятых/кавычек), неизвестные id, неизвестные ключи/опции (алиасы → авто-нормализация с
пометкой), числа, confidence 0..100, уровни строк: **ошибка** (не отправить), **внимание** (confidence < 60, смена категории/бренда, описание потеряло
оговорку «уценка/б/у», пропали числа), **ок**. Шаг 3: карточка товара — фото + название, слева «было», справа «станет» по полям с цветной точкой
уверенности, ссылки-источники, заметки ИИ, предложения новых опций (кнопка «добавить опцию в схему»), чекбоксы по полям и по товару,
«Только ≥ 80», «Отметить проверенными» (READY), sticky «Сохранить N товаров».

## 5. Поведение на витринах

### Mini App (frontend/)
- Каталог грузится как сейчас целиком (`/api/products`) + `/api/catalog/schema` (кэш TanStack 5 мин).
- Ряд чипов 1-го уровня: «Все» · корневые категории (по sort_order, только show_in_menu и с товарами) · «Уценка» (если есть) — последним.
  Выбран корень с детьми → под ним второй ряд мелких чипов: «Все клавиатуры · Магнитные · Механические».
- Кнопка «Фильтры» (иконка + бейдж числа активных) рядом с сортировкой → нижняя шторка: Бренд, Цена (от–до), Наличие, Состояние, затем
  фасеты выбранной категории по группам (чипы с количеством; бакеты; «от–до» для диапазонов; bool — один чип). Липкая кнопка «Показать N товаров»
  (N пересчитывается живьём), «Сбросить». Без выбранной категории — только бренд/цена/наличие/состояние и подсказка «выберите категорию, чтобы фильтровать по характеристикам».
- Под чипами — строка активных фильтров (чипы с ×). Смена категории сбрасывает фильтры по характеристикам, бренд/цена остаются.
- Состояние фильтров живёт в `sessionStorage` (переживает переход в товар и назад), не в URL.
- Карточка в сетке: строка-сводка из `highlight` атрибутов («51 г · PAW3950 · 8000 Гц»), бейдж «Уценка».
- Товар: вместо `#тегов` — хлебные крошки «Клавиатуры › Магнитные» (тап → каталог с этой категорией), бренд (тап → фильтр по бренду),
  плашка состояния с `conditionNote`, блок «Характеристики»: первые 6 строк, «Все характеристики» раскрывает остальное по группам.

### Сайт (site/)
- `/catalog/<slug>` — корень или лист (slug уникальны). Хлебные крошки Каталог › Клавиатуры › Магнитные. Родитель: плитки/чипы подкатегорий над сеткой.
- Раскладка (≥1280): слева дерево категорий (240), в центре сетка, **справа** панель фильтров (280; сворачиваемые секции, у длинных — «Показать все»).
  У панели нет своего скролла: короткая липнет под шапкой, длинная едет со страницей и липнет нижним краем
  (`top = min(header+16, innerHeight − высота − 16)`, пересчёт по ResizeObserver). 1024–1279 — категории | сетка, фильтры в правой шторке;
  <1024 — только сетка, фильтры в шторке (≥768 справа, <768 полноэкранная). Над сеткой: «Фильтры (N)» (<1280) · «Найдено N» · сортировка,
  ниже — чипы активных фильтров (на телефоне одной горизонтальной лентой). Ниже 1280 строка «Фильтры · сортировка» липкая под шапкой.
- **Черновик + «Показать N».** Клик по опции меняет только черновик (галочка сразу, URL не трогается); N и счётчики всех фасетов
  пересчитываются в браузере тем же `shared/catalog.ts` (`filterProducts`/`buildFacets`/`priceBounds`) по пулу товаров выдачи —
  сервер отдаёт его в `Listing.engine` (`CatalogEngine`: товары только с полями для фильтрации + срез схемы; ~220 товаров — несколько КБ,
  дешевле и точнее серверного запроса на каждый клик). Порядок значений в секции во время черновика не прыгает (как у применённого выбора).
  Изменённые, но не применённые опции подсвечены. Диапазоны «от–до» попадают в черновик по паузе в вводе / blur / Enter (без кнопки ✓).
  - Десктоп: слева от панели у последней изменённой строки всплывает ярлычок со стрелкой: «Показать N товаров» (акцентная) + «Отменить»;
    переезжает к следующему изменению, сам не исчезает (Esc = отменить). N=0 — «Ничего не найдено», кнопка неактивна. Если строка
    ушла за экран — внизу экрана плашка «Изменены фильтры · Применить · N товаров».
  - Шторка (<1280): тот же черновик; в шапке «Найдено N» по черновику, внизу «Сбросить» (чистит черновик) и «Показать N товаров» —
    применяет, закрывает и ведёт к списку. Закрытие крестиком / Esc / фоном / свайпом (вниз — лист, вправо — шторка) с изменённым черновиком
    тоже применяет.
- Применение: `router.replace(url, {scroll:false})` (сетка притухает до ответа сервера) + прокрутка к якорю `#catalog-results` над строкой
  «Найдено N» — только если он выше видимой области (при `prefers-reduced-motion` без плавности); фокус на «Найдено N» (tabIndex −1).
  Сразу, без черновика: снятие чипа, «Сбросить всё», сортировка, пагинация (пагинация тоже ведёт к якорю списка, а не в верх страницы).
- Прогрессивное улучшение: каждая опция, чип и страница — настоящая ссылка на состояние (rel=nofollow у фильтров), JS лишь перехватывает
  обычный клик. Без JS, в новой вкладке и по общей ссылке всё работает через SSR.
- Фильтры в query (`filterToParams`), SSR читает их (`filterFromParams`) и считает фасеты по `all=1` выдаче категории. Любой фильтр в URL →
  `robots: noindex, follow` + canonical на чистую категорию. Пагинация после фильтрации на сервере сайта.
- `/catalog/utsenka` — подборка condition≠NEW, без фасета «Состояние». `/catalog` (все) — фасеты бренд/цена/состояние.
- Товар: блок «Характеристики» (таблица по группам) под описанием; бренд-ссылка `/catalog?brand=<slug>`; плашка уценки; JSON-LD:
  `brand` из справочника, `itemCondition` (UsedCondition для MARKDOWN/USED — как Google фид), `additionalProperty` из specs, `category` = путь.
- Меню: корневые категории; у родителей — выпадающий список подкатегорий (десктоп), вложенный список (мобильное меню). Подвал — корни.
- Главная: плитки корневых категорий; картинка по `artKind` (фолбэк — текущий подбор по slug).
- Фиды: `g:product_type` = «Клавиатуры > Магнитные клавиатуры», `g:condition` по `condition`, `g:brand` из справочника (чинит баг — сейчас
  админский бренд в фидах игнорируется), `g:product_detail` из specs; Hotline: `vendor` из справочника, `<param name="…">` из specs (до 20),
  уценка исключается как сейчас. `GOOGLE_CATEGORY`/`NO_WARRANTY` пополнить новыми slug'ами.
- Ревалидация: смена товара ревалидирует путь его категории и всех предков + `utsenka`.

### Админка (frontend-admin/)
- Меню: «Теги» → **«Категории»** (дерево: корни и дети с отступом, ↑↓ и «переместить в…», счётчики товаров, «скрыта из меню»), диалог категории:
  вкладки «Основное» (имя, slug, родитель, в меню, картинка-плитка), «SEO» (как было), «Характеристики» (список атрибутов: унаследованные серым
  с пометкой «из «Клавиатуры»», свои — редактируемые; диалог атрибута: подписи ru/uk/en, ключ (авто из ru, транслит, нельзя менять после
  использования), тип, единица ru/uk/en, группа, флажки, бакеты (таблица от/до/подписи), опции (value, подписи, алиасы, ↑↓, «объединить с…»),
  подсказка для ИИ, «используется в N товарах»).
- **«Бренды»** — новый раздел (в «Ещё»): таблица имя/slug/сайт/товаров, алиасы, «объединить».
- Мастер товара: шаг «Теги» → **«Категория»**: выбор листа (дерево-селект с поиском), бренд (комбобокс с поиском + «Создать „…“»), состояние
  (Новый / Уценка / Б/у) + причина. Новый шаг **«Характеристики»**: форма по схеме категории, сгруппированная; у полей из ИИ — точка уверенности и ссылка
  на источник (тултип); обязательные помечены; тристейт для bool (да/нет/не знаю); «Очистить поле». Внизу шага — статус карточки
  (Черновик / От ИИ · уверенность 82 % / Проверена) и кнопка «Отметить проверенной». Шаг «Сайт» теряет поле бренда; артикул остаётся.
  Шаг «Проверка» показывает категорию-путь, бренд, состояние, сводку характеристик и «не заполнено обязательных: N».
- Список товаров: фильтры категория (дерево), бренд, статус карточки (Черновик / От ИИ / Проверена / Неполная), состояние. Колонка-бейдж статуса карточки.
- **«Карточки»** — новый раздел рядом с «Переводами» (бейдж draft+aiFilled): статистика, три шага как в §4, вкладка «Очередь» (список карточек
  по статусам с переходом в товар и быстрым «Проверено»).
- Метрики: продажи/остатки по категориям считают по корневой категории товара (без двойного счёта), «Без категории» как сейчас.
- Переводы: тип `TAG` → `CATEGORY` (подпись «Категории»), новое поле PRODUCT `condition_note`.

## 6. Перенос данных (стенд → потом прод)

1. V52 переносит теги в категории 1:1 и ставит condition по «Уценке».
2. `PUT /api/admin/catalog/schema` заливает дерево (новые родители, переносы `kovriki`→`kovriki-tkanevye`, IEM → `naushniki-iem` и т.д.),
   атрибуты, опции, группы — из `.devdata/catalog-specs-2026-10-09/schema-final.json`.
3. Скрипт `.devdata/catalog-specs-2026-10-09/assign.py` → `PUT /api/admin/cards/import` раскладывает товары по листьям и брендам (без specs).
4. Саб-агенты выступают «любой ИИ»: получают **тот же промпт**, что строит админка (`card-prompt.ts`, вызов из node), плюс локальные данные
   specs-fetcher (EloShapes/Shopify брендов) как подсказку, отвечают в формате §4; ответы импортируются через `cards/import` со статусом AI_FILLED.
5. Владелец проверяет в админке («Карточки» → очередь), правит, ставит «Проверено».

## 7. Вне объёма (потом)

Сравнение товаров (страница `/compare`, лоток), страницы брендов `/brand/<slug>` (SEO), значения характеристик по вариантам (цвет варианта),
удаление `tags`/`product_tags`/`products.brand` (V5x после прод-выкатки), AI-перевод подписей схемы через «Переводы».
