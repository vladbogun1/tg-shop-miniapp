# Сайт магазина — контракт (этап 1)

Канонический контракт между бэкендом и фронтом сайта `site/`. Дизайн-документ с обоснованием —
в Claude Docs («Сайт магазина maxsolch — дизайн-документ»). Здесь — только то, что нужно для кода.

**Основа:** ветка `site` от `master` (прод v2.8.1). Последняя миграция на master — V17.
Ветку `catalog-cleanup` НЕ используем (варианты = имя + остаток, цена/фото на товаре).

> **Актуальное состояние (2026-10).** Сайт открыт с v2.9.0 и живёт на `https://chisetup.com.ua`
> (Mini App — `app.chisetup.com.ua`, админка — `admin.chisetup.com.ua`, старый `maxsolkh.shop` → 301).
> Часть решений ниже с тех пор изменилась:
> - оплата — **онлайн через monobank-эквайринг** (с v3.9.0), реквизиты карты и скриншоты перевода
>   убраны, см. [`MONOBANK-ACQUIRING.md`](MONOBANK-ACQUIRING.md);
> - дизайн — v3 ChiSetup, одна тёмная тема ([`DESIGN-V3.md`](DESIGN-V3.md)), neo-brutalism удалён;
> - «закрытый сайт» (вход по коду `SITE_GATE_CODE`, заглушка) удалён — сайт открыт;
> - отзывы и вопросы до покупки есть ([`ORDERS-SUPPORT-REVIEWS.md`](ORDERS-SUPPORT-REVIEWS.md)),
>   переводы контента — [`CONTENT-I18N.md`](CONTENT-I18N.md).
>
> Остальной текст — исходный контракт этапа 1, оставлен как история решений.

## Решения владельца (не менять)

- Заказ только после входа через Telegram. Гостевого заказа нет.
- Домен сайта — корень домена (сейчас `https://chisetup.com.ua`). Mini App и админка — на своих поддоменах.
- ~~Оплата как в боте: реквизиты, загрузка скрина перевода, эквайринга нет~~ — заменено:
  варианты из `payment_options` (предоплата 100 ₴ онлайн + наложка / полная оплата онлайн),
  оплата через monobank-эквайринг, заказ подтверждает админ.
- Доставка как в боте: Нова Пошта с выбором отделения на карте (`/api/np/warehouses/bbox`) + самовывоз.
- Стиль — ~~neo-brutalism~~ дизайн v3 ChiSetup (одна тёмная тема), раскладка — как у
  vinli.com.ua (шапка с поиском, корзина-дровер, строка категорий, сайдбар фильтров, сетка товаров,
  страница товара «галерея слева / покупка справа», чекаут одной страницей в 2 колонки, кабинет
  с меню слева).
- Все текущие теги = категории меню.
- Корзина гостя — локальная (localStorage); после входа — серверная, общая с Mini App (раздел
  «Серверная корзина» ниже, 2026-10). Отзывы, сравнение, бренды, характеристики — НЕ в этом этапе.
- Языки: uk (по умолчанию, без префикса), ru (`/ru/...`), en (`/en/...`). Контент товаров пока
  на русском — показываем как есть.

## База данных (Flyway)

### V18__site_storefront.sql
- `products.slug VARCHAR(160) NULL` → после заполнения `NOT NULL` + `UNIQUE ux_products_slug`.
- `products.compare_at_minor BIGINT NULL` — старая цена (зачёркнутая). Показывается, только если > price.
- `products.seo_title VARCHAR(255) NULL`, `products.seo_description VARCHAR(512) NULL`.
- `tags.slug VARCHAR(160)` (UNIQUE, NOT NULL после заполнения), `tags.sort_order INT NOT NULL DEFAULT 0`,
  `tags.show_in_menu BOOLEAN NOT NULL DEFAULT TRUE`.
- Заполнение slug — Java-миграция (`db/migration` → `V18_1__...` класс `BaseJavaMigration`) или
  в той же логике на старте; транслит кириллицы (uk+ru) → латиница, `[a-z0-9-]`, ≤ 120 символов,
  при совпадении суффикс `-2`, `-3`… Тот же `SlugService` используется при создании/правке товара
  и тега в админке (если slug не задан руками).

### V19__web_login.sql
- `web_login_tokens`: `id BINARY(16) PK`, `nonce_hash CHAR(64) UNIQUE`, `bind_hash CHAR(64)`,
  `match_code TINYINT`, `status ENUM('PENDING','CONFIRMED','REJECTED','USED','EXPIRED')`,
  `telegram_user_id BIGINT NULL`, `user_agent VARCHAR(512)`, `ip VARCHAR(64)`,
  `bot_chat_id BIGINT NULL`, `bot_message_id INT NULL`, `created_at`, `expires_at`, `confirmed_at NULL`, `used_at NULL`.
- `web_sessions`: `id BINARY(16) PK`, `user_id BIGINT FK users`, `refresh_hash CHAR(64) UNIQUE`,
  `user_agent VARCHAR(512)`, `ip VARCHAR(64)`, `created_at`, `last_used_at`, `expires_at`, `revoked_at NULL`.

### V20__order_source.sql
- `orders.source ENUM('MINIAPP','WEB','ADMIN') NOT NULL DEFAULT 'MINIAPP'`.

Все изменения аддитивны: Mini App и админка работают без правок; откат бэкенда безопасен.

## API

Все DTO — JSON, деньги в копейках (`*Minor`), id — UUID-строки (как сейчас).

### Каталог (публичный, без авторизации)

`ProductDto` расширяется полями (Mini App их игнорирует):
`slug: string`, `compareAtMinor: number|null`, `seoTitle: string|null`, `seoDescription: string|null`,
`createdAt: string (ISO)`.
`TagDto` расширяется: `slug: string`, `sortOrder: number`, `showInMenu: boolean`.

- `GET /api/public/categories` → `[{ id, slug, name, sortOrder, productCount }]` — только
  `showInMenu`, отсортировано по `sortOrder, name`; `productCount` = активные неархивные товары.
- `GET /api/public/products?category=<slug>&q=<text>&inStock=true&priceMax=<minor>&sort=<s>&page=0&size=24`
  → `{ items: ProductDto[], total, page, size, priceMaxAvailable }`.
  `sort`: `default` (как в Mini App: в наличии выше, потом по продажам/новизне), `price_asc`,
  `price_desc`, `new`, `name`. `q` — поиск по названию и описанию без учёта регистра.
  `inStock` — эффективный остаток > 0 (сумма вариантов, если они есть, иначе `stock`).
  `size` ≤ 60. `priceMaxAvailable` — максимум цены в выборке без учёта `priceMax` (для слайдера).
- `GET /api/public/products/by-slug/{slug}` → `ProductDto` или 404.
- `GET /api/public/sitemap` → `{ products: [{slug, updatedAt}], categories: [{slug}] }`.
- Существующий `/api/products` остаётся без изменений (Mini App); `/api/tags` удалён в 2026-10 (никто не вызывал).

### Вход на сайт через бота

Cookies (все `HttpOnly`, `SameSite=Lax`, `Secure` = env `WEB_COOKIE_SECURE`, по умолчанию `true`,
в `dev`-профиле `false`):

| Cookie | Path | Срок | Что |
| --- | --- | --- | --- |
| `login_bind` | `/api/auth/web` | 5 мин | случайный секрет; в БД его SHA-256 |
| `access` | `/` | 15 мин | CUSTOMER JWT (тот же формат, что у Mini App) + claim `chn=web` |
| `refresh` | `/api/auth/web` | 30 дней | непрозрачный токен; в БД SHA-256; ротация при каждом refresh |

- `POST /api/auth/web/start` → `{ loginId, deepLink, matchCode, expiresAt }` + ставит `login_bind`.
  `deepLink = https://t.me/<botUsername>?start=login_<nonce>`; nonce = 32 байта base64url (43 симв.).
  `matchCode` — число 10–99. Лимит: 10 start/мин на IP (RateLimitFilter).
- `GET /api/auth/web/status?loginId=` → `{ status: 'PENDING'|'CONFIRMED'|'REJECTED'|'EXPIRED'|'USED' }`.
- `POST /api/auth/web/complete { loginId }` — требует `login_bind`, совпадающий с токеном, статус
  `CONFIRMED`, не истёк → статус `USED`, создаётся `web_sessions`, ставятся `access` + `refresh`,
  `login_bind` удаляется. Ответ: `{ user: AuthUserDto }`. Иначе 400/401.
- `POST /api/auth/web/refresh` — по cookie `refresh` → новый `access` + новый `refresh` (старый
  становится недействительным; повторное использование старого = отзыв всей сессии). 401, если нет.
- `POST /api/auth/web/logout` — отзывает текущую сессию, чистит cookies. 204.
- `GET /api/me/sessions` → `[{ id, userAgent, ip, createdAt, lastUsedAt, current }]`.
- `DELETE /api/me/sessions/{id}`, `DELETE /api/me/sessions` (все). 204.
- **Только профиль `dev`:** `POST /api/auth/web/dev-login { telegramUserId }` → как `complete`
  (для локальных тестов без Telegram). В прод-профиле эндпоинта нет (бин не создаётся).

`JwtAuthFilter`: токен из `Authorization: Bearer` ИЛИ из cookie `access`. Если из cookie и метод
изменяющий (POST/PUT/PATCH/DELETE) — проверить `Origin`/`Referer` против разрешённых origin
(`AllowedOrigins` + `SITE_BASE_URL`); иначе 403.
WebSocket `/ws`: при CONNECT без заголовка Authorization брать JWT из cookie `access` рукопожатия
(HandshakeInterceptor → атрибуты сессии).

### Бот (`ShopBot`)

- `/start login_<nonce>` → найти токен по SHA-256(nonce), PENDING и не истёк. Ответ (на языке
  пользователя, `messages_*.properties`): «Вход на сайт · <браузер, ОС> . Выберите
  число, которое видите на сайте» + inline-кнопки: 3 числа (одно верное, порядок случайный) и
  «Это не я». `callback_data`: `wl:<loginId>:<n>` / `wl:<loginId>:x`.
- Верное число → `CONFIRMED`, `telegram_user_id = from.id`, `authService.recordBotUser(from)`,
  сообщение правится на «Вход подтверждён, вернитесь на сайт». Неверное / «Это не я» → `REJECTED`
  (одна попытка), сообщение «Вход отменён».
- Истёкший/неизвестный nonce → «Ссылка устарела, начните вход на сайте заново».
- После `complete` бот шлёт «Выполнен вход на сайт · <браузер> » + кнопка «Завершить эту сессию»
  (`ws:<sessionId>:end` → revoke, правка сообщения).
- `/start` без payload — как сейчас.

### Заказы

- Заказ, созданный с cookie-авторизацией (claim `chn=web`), получает `source=WEB`. `OrderCardDto`,
  `OrderDetailDto` (админ) отдают `source`. Карточка в Telegram-канале: строка «🌐 Сайт» для WEB.
- Всё остальное (`/api/me/**`, `/api/orders`, `/api/payment-options`, `/api/np/**`, чат, `/ws`) — без изменений.

### Админка (`frontend-admin`)

- Форма товара: `slug` (с автогенерацией, если пусто), `compareAtMinor` (старая цена), `seoTitle`, `seoDescription`.
- Теги: `slug`, `sortOrder`, `showInMenu`.
- Бейдж «Сайт» на карточке заказа (доска, таблица, дровер) при `source=WEB`.

### Ревалидация сайта

После сохранения товара/тега бэкенд шлёт `POST ${SITE_REVALIDATE_URL}` (например
`http://site-public:3000/_site/revalidate`) с заголовком `x-revalidate-secret: ${SITE_REVALIDATE_SECRET}`
и телом `{ paths: ["/product/<slug>", "/catalog", ...] }`. Пустой URL → не шлём. Ошибки — WARN, не падать.

Обработчик сайта — **`POST /_site/revalidate`** (не `/api/...`: в проде весь `/api` гейтвей отдаёт
бэкенду; `/_site/*` идёт на сайт). Секрет — env `SITE_REVALIDATE_SECRET` у сайта и бэкенда (один и
тот же). Пути принимаются как их видит посетитель (`/product/x`, `/ru/product/x`); сайт сам
сопоставляет их своим маршрутам и дополнительно сбрасывает data-cache тег `catalog`.
Ответ: 200 `{ ok, revalidated }`, 401 при неверном секрете, 400 при кривом теле.

## Сайт `site/`

- Workspace `site` в корневом `package.json`. Next.js 15 App Router, React 19, Tailwind v4,
  TanStack Query, zustand, lucide-react, framer-motion (умеренно), leaflet (карта НП). Порт dev **3006**.
- SSR/ISR для публичных страниц: сервер ходит в `INTERNAL_API_BASE` (`http://backend:8080` в docker,
  `http://localhost:8080` в dev). Браузер — относительные `/api`, `/ws`, `/img` (same-origin).
  В dev — `rewrites` в `next.config.ts` на бэкенд `:8080` и кэш картинок `:8082`, чтобы cookie
  работали как на проде.
- Все fetch из браузера — `credentials: 'include'`, без Authorization. На 401 от `/api/me/**` —
  один раз `POST /api/auth/web/refresh`, повторить запрос; снова 401 → считать гостем.
- Маршруты, рендер и этапы — см. таблицу «Карта страниц» в дизайн-документе:
  `/`, `/catalog`, `/catalog/[category]`, `/search`, `/product/[slug]`, `/cart`, `/login`, `/checkout`,
  `/checkout/success/[id]`, `/account`, `/account/orders/[id]`, `/account/settings`, `/delivery`,
  `/contacts`, `/about`, `/returns`, `/warranty`, `/privacy`, `/terms`, `sitemap.xml`, `robots.txt`, 404/500.
  С префиксами `/ru` и `/en`.
- Юридические тексты — `site/content/legal/uk/*.md`, рендер markdown; для ru/en пока показывать uk.
- SEO: `generateMetadata` (title/description/OG-картинка через `/img`), `alternates.languages`
  (hreflang), JSON-LD `Product` + `BreadcrumbList` на товаре, `Organization` на главной.
  До публичного запуска — `robots: noindex` через env `SITE_INDEXABLE=false`.
- Docker: `site/Dockerfile` (standalone, сборка из корня репо `-f site/Dockerfile .`), сервис `site`
  в `docker-compose.yml`, `site-public` в `docker-compose.public.yml`, `infra/gateway-site.conf` (до 2026-10 — `.template` с входом по коду `SITE_GATE_CODE`; гейт удалён)
  (`/` → site, `/api` и `/ws` → backend, `/img` → nginx-кэш; resolver 127.0.0.11 + переменные,
  как в `gateway.conf`), `gateway-site` в `docker-compose.prod.yml` на `127.0.0.1:8092`.
- CI: джоба `site` (typecheck + build) в `ci.yml`; образ `vladbogun1/maxsolch2-site` в `publish.yml`.

## Серверная корзина (2026-10)

Цель владельца: корзина ходит за покупателем между сайтом и Mini App (один Telegram-аккаунт) и
переживает смену устройства. Гость на сайте по-прежнему с локальной корзиной.

### База — `V22__customer_cart.sql`

- `carts(user_id PK FK users ON DELETE CASCADE, version BIGINT, updated_at TIMESTAMP(3))` — номер
  версии (растёт при каждой записи, в т.ч. при оформлении заказа) и строка-замок: каждая запись
  делает `SELECT … FOR UPDATE` по ней, поэтому слияние и замена одного покупателя не перемежаются.
  Строка создаётся `INSERT IGNORE` (две первые записи с двух устройств не падают на PK).
- `cart_items(id, user_id FK carts, product_id FK products ON DELETE CASCADE, variant_id NULL FK
  product_variants ON DELETE CASCADE, qty CHECK 1..99, added_at, updated_at)`.
  Уникальность строки — `UNIQUE (user_id, product_id, variant_key)`, где
  `variant_key = IFNULL(variant_id, 0x00…00)` — **VIRTUAL** generated column: UNIQUE с NULL в MySQL
  не работает, а у STORED-колонки MySQL запрещает `ON DELETE CASCADE` на базовой колонке
  (проверено на 8.4: дубль отклоняется, каскады по товару и варианту работают).
- Цены в корзине НЕ хранятся — ответ всегда с сегодняшней ценой.
- Лимиты: 100 разных строк (`CartRules.MAX_LINES`), 1–99 шт. на строку, ≤ 500 строк в одном запросе.

### API (роль CUSTOMER: bearer Mini App ИЛИ cookie сайта)

Язык ответа — `Accept-Language` (названия товара/варианта через слой переводов, ru = оригинал).

- `GET /api/me/cart` → `CartDto`
- `PUT /api/me/cart` `{ lines: [{ productId, variantId|null, quantity }] }` → `CartDto` — замена
  целиком, last-write-wins. Дубли в запросе суммируются, кол-во зажимается до 99, кривые id и
  `quantity ≤ 0` отбрасываются, несуществующие товары / чужие варианты отбрасываются. > 100 строк → 400.
- `POST /api/me/cart/merge` (тело то же) → `CartDto` — слияние гостевой корзины.
- ~~`DELETE /api/me/cart`~~ — удалён в 2026-10 (клиенты его не вызывали).

```jsonc
// CartDto
{ "version": 7, "updatedAt": "2026-10-04T10:00:00.123Z", "maxLines": 100, "maxQuantity": 99,
  "lines": [{ "productId": "…", "variantId": null, "quantity": 2,
              "title": "Килимок …", "slug": "kover-…", "variantName": null, "imageUrl": "products/…jpg",
              "priceMinor": 65000, "compareAtMinor": null, "currency": "UAH",
              "stock": 38,                       // эффективный: вариант → сумма вариантов → товар
              "available": true,
              "problem": null,                   // INACTIVE | OUT_OF_STOCK | VARIANT_REQUIRED
              "addedAt": "…" }] }
```

Строки скрытых/архивных/распроданных товаров **хранятся и помечаются** (`available=false`), а не
исчезают — покупатель видит, почему товар нельзя заказать; вернётся в продажу — строка снова
доступна. Удалённый товар/вариант уносит строку каскадом.

**Слияние = max(кол-во), не сумма.** Гостевая и серверная корзины — обычно одно и то же намерение с
двух устройств (или тот же браузер входит повторно); сумма удваивала бы количество при каждом входе.
max идемпотентен — повторённый (ретрай) merge ничего не меняет. Строки аккаунта сохраняют порядок,
новые гостевые идут после; сверх 100 строк лишние гостевые отбрасываются (вход не должен падать).

**После заказа** `OrderService.createOrder` в той же транзакции удаляет заказанные строки
(product+variant, целиком) из серверной корзины и поднимает версию: заказ и корзина фиксируются или
откатываются вместе. Повтор по `Idempotency-Key` в сервис не доходит.

### Клиенты

Общие типы — `shared/src/cart.ts` (`ServerCart`, `cartSignature`).

**Сайт** (`site/lib/cart-sync.ts`, `<CartSync/>` в Providers; стор `site-cart-v1` получил поле
`owner: "guest" | "server"`):
- гость — всё как раньше, локально;
- вход (сессия стала `authed`): непустая гостевая корзина → `POST /merge`, иначе `GET`; стор
  становится локальной копией серверной (`owner: "server"`);
- правки — оптимистично в сторе, `PUT` через 400 мс после последней; ответ (цены/остатки/доступность)
  применяется, только если локально ничего не поменялось за время запроса;
- фокус окна / вкладка снова видима → `GET` (не чаще раза в 2 с), уход вкладки в фон → незаписанная
  правка уходит `fetch(…, { keepalive: true })`;
- недоступные строки приходят со `stock: 0` — существующий UI уже показывает «нет в наличии» и
  блокирует оформление;
- **выход** (или сервер подтвердил, что сессии нет): перед `logout` незаписанная правка
  дописывается, локальная копия **очищается** — корзина сохранена на сервере, а следующий человек за
  общим компьютером её не увидит. Недоступный бэкенд (не «401») корзину не трогает;
- оформление: перед `POST /api/orders` — `flushCart()` (иначе запоздалый `PUT` вернул бы заказанные
  строки), после успеха — заказанные строки убираются локально БЕЗ записи и корзина перечитывается.
  Цены по-прежнему перепроверяет `useCartValidation`.

**Mini App** (`frontend/lib/cart-sync.ts`, `startCartSync()` в Providers; стор `tgshop-cart-v1`
получил `migrated`):
- до обмена initData → JWT к `/api/me/cart` не ходим (правило из `archive/UI-FIXES.md`), показывается сохранённая копия;
- первый запуск после релиза (`migrated=false`): локальная корзина один раз сливается `merge`, дальше
  истина — сервер. Правки, сделанные до появления токена, тоже уходят через `merge` (ничего не теряется);
- запись/перечитывание — как на сайте (400 мс, `visibilitychange`, `keepalive`), новый токен → `GET`;
- UI не менялся: недоступные строки в Mini App **не показываются** (у его корзины нет такого
  состояния, и оформление упало бы на них), но держатся в памяти и уходят в каждом `PUT`, поэтому
  остаются на сервере и видны на сайте с пометкой; количество зажимается до остатка;
- после заказа — то же, что на сайте.

Промокод остаётся локальным для каждого устройства (резерв промокода — по аккаунту, как и был).
Новых строк интерфейса нет — словари не менялись.
