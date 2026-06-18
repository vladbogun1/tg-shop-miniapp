# tg-shop-v2 — Передаточный документ (HANDOFF)

> Полный контекст проекта для продолжения в новом чате. Содержит видение, бизнес-решения,
> что реализовано/осталось, детальный разбор кодовой базы, конфигурацию, запуск, поддержку,
> Telegram-настройку и подводные камни.
>
> Связанные документы (в этом же репо):
> - `ДИЗАЙН-ДОКУМЕНТ-старый-проект.md` — разбор старого магазина «как было».
> - `ДИЗАЙН-ДОКУМЕНТ-новый-проект.md` — план/архитектура нового проекта (детально).
> - `tg-shop-v2/docs/SPEC.md` — канонический технический контракт (версии, порты, env, API).
> - Память ассистента: `C:\Users\nikto\.claude\projects\D--CLOUDE-maxsolch-shop\memory\maxsolch-shop-project.md`
>
> Дата: 2026-06-18.

---

## 0. Что это и зачем

Интернет-магазин в Telegram (Mini App) + веб-админка. Пользователь переписывает **с нуля**
старый проект (`tg-shop-miniapp/`, вайбкоженный с ChatGPT) — новый код в **`tg-shop-v2/`**.

**Главные идеи нового проекта:**
- Бот — тонкий: только кнопка входа `/start` → Mini App и **уведомления**. Никаких переписок/управления внутри Telegram.
- Всё на сайте: каталог, корзина, пошаговый чекаут, личный кабинет, **чат с админом прямо на сайте** (WebSocket, в стиле Telegram).
- Покупатель авторизуется через Telegram initData → JWT. Админ — через **браузер по логину/паролю** (Spring Security + bcrypt + JWT, аннотация `@RequiredAdmin`).
- Дизайн — **Liquid Glass** (iOS-стиль), без дефолтных html-инпутов.
- Картинки — self-hosted (MinIO + imgproxy + Nginx-кэш), без облаков.
- Админ-уведомления — в мультигруппу Telegram с темами по статусам, карточка «переезжает» между темами.

---

## 1. Структура репозитория

```
D:\CLOUDE\maxsolch-shop\
├── tg-shop-miniapp/         СТАРЫЙ проект (Java/Spring Boot, vanilla JS). Источник данных для импорта.
│   └── docker-compose.local.yml  (db на :3330 из дампа ../safety-backups/*.sql)
├── safety-backups/          дамп старой БД (~136МБ, схема+данные+1196 картинок-блобов)
├── ДИЗАЙН-ДОКУМЕНТ-старый-проект.md
├── ДИЗАЙН-ДОКУМЕНТ-новый-проект.md
├── HANDOFF.md               (этот файл)
└── tg-shop-v2/              НОВЫЙ проект
    ├── docs/SPEC.md         канонический контракт
    ├── docker-compose.yml         основной стек (локально)
    ├── docker-compose.public.yml  оверлей для Telegram-релиза (gateway + relative-фронты)
    ├── .env / .env.example        вся конфигурация
    ├── backend/             Spring Boot (Java 21), package com.maxsolch.shop
    ├── frontend/            Next.js 15 — Mini App покупателя (mobile-first)
    ├── frontend-admin/      Next.js 15 — админка (desktop-first), порт 3001
    ├── infra/               nginx.conf (кэш картинок), gateway*.conf, скрипты, backfill SQL
    ├── migration/           тулза импорта старой БД (JDBC old→new + картинки в MinIO)
    └── design-backups/glass-v1/   бэкап первой версии стекла (на случай отката)
```

---

## 2. Технологический стек

- **Backend**: Java 21 (Temurin), **Spring Boot 3.4.x** (НЕ 4.x — ради зрелой поддержки springdoc/telegrambots), Maven (fat jar `app.jar`). Модули: web, validation, data-jpa, security, websocket, thymeleaf, actuator, cache(Caffeine), flyway, mysql-connector-j, telegrambots-spring-boot-starter 6.9.7.1, springdoc-openapi 2.x, jjwt 0.12, minio 8.5, lombok.
- **DB**: MySQL 8.4. Схема — только через **Flyway** (`ddl-auto=validate`). База `tgshop_v2`.
- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + TanStack Query + framer-motion + lucide-react. Чат — @stomp/stompjs + sockjs-client. Корзина — zustand. Канбан-дnd — @dnd-kit. Метрики — recharts.
- **Картинки**: MinIO (оригиналы) + imgproxy (ресайз/WebP/AVIF) + Nginx (disk-кэш).
- **Туннели для Telegram**: cloudflared quick tunnels (без аккаунта, без интерстишала — в отличие от ngrok).

**Инструменты на ПК пользователя** (Windows): Java 21 в `C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot`, Maven 3.9.9 в `C:\Tools\apache-maven-3.9.9` (прописаны в JAVA_HOME/PATH + ~/.bashrc). cloudflared в `C:\Program Files (x86)\cloudflared\cloudflared.exe`. Docker Desktop. ngrok (есть authtoken, но НЕ используем — интерстишал ломает Telegram).

Локальная сборка бэкенда: `cd tg-shop-v2/backend && mvn -q -B -DskipTests package` (JAVA_HOME/PATH уже в bashrc).

---

## 3. Зафиксированные бизнес-решения

- **Оплата**: БЕЗ онлайн-эквайринга (не хотим комиссий). Покупатель на чекауте выбирает **вариант оплаты**:
  - Вариант 1 — «Передоплата 100 грн» (бронь + бесплатная доставка).
  - Вариант 2 — «Полная оплата на карту».
  - Реквизиты: карта `4246001040134680`, IBAN `UA663052990000026005025918119`, РНОКПП `3547612413`. Показываются после оформления; подтверждение — через чат/вручную.
- **Доставка**: Новая Почта (приоритет, выбор города+отделения) ИЛИ Самовывоз.
- **Чекаут**: пошаговый (Контакты → Доставка → Оплата → Подтверждение → Готово).
- **i18n**: НЕ делаем пока (всё по-русски).
- **БД**: MySQL.
- **Админ-вход**: браузер, логин/пароль (НЕ через Telegram).
- **Метрики**: для точной «скорости обработки» введены поля времени переходов статуса.
- **Хард-удаление заказов** разрешено только в терминальном статусе (Доставлен/Отклонён) — для чистки тестовых из метрик.

---

## 4. Фичи: что реализовано

**Каталог/товары:** список товаров, фото-галерея (стрелки ‹›/точки/свайп), теги (M↔N), варианты с отдельным стоком, мягкое удаление (архив), скрытие (active), счётчик продаж; поиск по названию + фильтр-чипы по тегам в шапке.

**Карточка товара:** fullscreen-overlay (не bottom-sheet), сверху (не скроллится) — название/цена/варианты/кнопка покупки; ниже скролл — галерея + описание. Кнопка «В корзину» морфит в «− кол-во +» (и в карточке каталога, и в товаре). Товары с вариантами в каталоге → кнопка «Выбрать».

**Корзина/заказ:** zustand-корзина (localStorage), пошаговый чекаут с выбором доставки (НП автокомплит города/отделения / самовывоз) и варианта оплаты; снимки цен/названий; списание/возврат стока; промокоды (% и фикс-сумма). Валюта UAH.

**Аккаунт покупателя:** мои заказы, детальная карточка (статус, таймлайн, ТТН, реквизиты), **чат заказа** (WebSocket realtime, в стиле Telegram: пузыри, реплаи, фото/файлы, статусы прочтения). Колокольчик «новые сообщения» в шапке.

**Бот (тонкий):** `/start` → кнопка-WebApp; кнопка-меню (setChatMenuButton); уведомления: новый заказ → карточка в тему «Новые» (HTML-форматирование), смена статуса → карточка **переезжает** между темами; смена статуса → DM покупателю; сообщение от админа в чате → DM покупателю «Открыть переписку»; сообщение от клиента → уведомление админам в тему «Сообщения» + кнопка «Открыть в админке».

**Админка (desktop-first, есть мобильный фолбэк):**
- Вход логин/пароль. Колокольчик новых сообщений в топбаре.
- **Канбан-доска** заказов с drag&drop между статусами (dnd-kit); дроп в «Выслан» → запрос ТТН, в «Отклонён» → причина; реальные счётчики в шапках колонок; переключатель срока (Месяц/Полгода/Год/Всё); поиск по любому полю (имя/телефон/ТТН/промокод/город/отделение/оплата/товары/UUID); переключатель «Доска/Таблица».
- **Таблица** заказов с сортировкой по колонкам (Дата/Клиент/Сумма/Статус) + пагинация.
- **Разворот заказа** (drawer/fullscreen): детали, **таймлайн с датами по шагам**, ссылка на Telegram клиента (@username или tg://user?id=), кнопки управления статусом, встроенный **чат с клиентом**, кнопка «Удалить навсегда» (только терминальный статус).
- **CRUD**: товары (+ загрузка картинок drag&drop в MinIO, варианты, теги), теги, промокоды; **настройки оплаты** (варианты + реквизиты); **Метрики** (recharts: выручка/заказы по дням, статусы-donut, топ товаров, способы доставки/оплаты, скорость обработки).

**Инфра:** docker-compose со всем стеком; картинки через MinIO+imgproxy+Nginx-кэш (WebP, immutable cache).

---

## 5. Фичи: что осталось / на будущее

- **Тесты + CI/CD** (сейчас тестов нет; CI не настроен).
- **Прод-деплой** на сервер пользователя (ждём SSH) — там Caddy + сертификаты + нестандартные порты; публичные gateway/relative-фронты переиспользуются вместо cloudflared.
- Подписанные imgproxy-URL (сейчас `insecure`/unsigned).
- Деривация городов НП в синке (сейчас города заполнены backfill-SQL из отделений; синк отделений работает).
- Доп. идеи из §11 дизайн-дока: онлайн-оплата (если захотят), Новая Почта — авто-создание ТТН, аналитика-расширение, резервирование стока, аудит-лог, отзывы, PWA.
- Косметика: hydration-warning в dev (telegram-web-app.js трогает `<html>`) — можно `suppressHydrationWarning` на `<html>`.

---

## 6. Кодовая база — детально

### 6.1 Backend (`tg-shop-v2/backend`, package `com.maxsolch.shop`)
- `domain/` — JPA-сущности всех таблиц + энумы (OrderStatus NEW/APPROVED/SHIPPED/DELIVERED/REJECTED, DeliveryMethod NOVA_POSHTA/PICKUP, SenderType CUSTOMER/ADMIN/SYSTEM, MessageType TEXT/PHOTO/FILE/SYSTEM, AdminRole). UUID = BINARY(16), генерится в @PrePersist через `common/UuidUtil` (MSB-first, совместимо с MySQL UUID_TO_BIN(...,0)).
- `repository/` — Spring Data JPA репозитории. В OrderRepository — поиск (search по любому полю + по item.titleSnapshot через exists), countByStatusSearch, findForMetrics. OrderMessageRepository — unread-счётчики (countUnreadBySenderType / countUnreadForUser), markRead.
- `service/`:
  - `OrderService` — createOrder (валидация наличия/вариантов/промо, скидка фикс>процент, списание стока, снимки, currency UAH, статус NEW) + переходы approve/ship(ttn)/deliver/reject(reason)/changeStatus. На переходах ставит **approved_at/shipped_at/delivered_at/rejected_at** = now. reject возвращает сток. Дёргает NotificationService.
  - `OrderQueryService` — маппинг в DTO (summary/detail/card), board-группировка. toDetail отдаёт тайминги + tgUserId/tgUsername.
  - `MessageService` — чат: persist + broadcast (WebSocket) + уведомления (onCustomerChatMessage / onAdminChatMessage), markRead, totalUnreadForCustomer/Admin.
  - `MetricsService` — range-bounded агрегация (revenueByDay, ordersByDay, statusCounts, topProducts, deliveryMethods, paymentOptions, deliverySpeed по таймстемпам).
  - `AuthService` — авторизация покупателя (initData→JWT, upsert users) и админа (initData ИЛИ логин/пароль bcrypt → JWT ADMIN).
  - `TimeRange` enum (MONTH дефолт/HALFYEAR/YEAR/ALL) → Instant lower bound через **Duration.ofDays** (НЕ Period — Instant не умеет месяцы!).
  - `CatalogService` — кэшируемое чтение каталога (@Cacheable products/productById/tags).
- `security/` — JwtService (HS256, jjwt), JwtAuthFilter (Bearer → Authentication с ROLE_CUSTOMER/ROLE_ADMIN), TgInitDataValidator (HMAC-SHA256 + TTL auth_date + флаг allowUnsigned), `@RequiredAdmin` (= @PreAuthorize hasRole ADMIN), SecurityConfig (stateless, CORS-бин с allowedOriginPatterns localhost/ngrok/webapp/admin, матчеры публичных/customer/admin путей), Role enum (authority = "ROLE_"+name).
- `web/controller/` — AuthController (/api/auth/telegram, /admin/telegram, /admin/login), MeController (/api/me + orders + chat + uploads + unread-count), CatalogController, PublicController (payment-options, np/cities, np/warehouses), AdminProductController, AdminTagController, AdminPromoController, AdminOrderController (board/list+sort/detail/status/delete/chat/unread-count), AdminPaymentController, AdminMetricsController, HomeController (Thymeleaf), AppInfoController. Ошибки → ApiExceptionHandler (Unauthorized 401, NotFound 404, BadRequest 400, Forbidden 403).
- `tg/` — `ShopBot` (TelegramLongPollingBot, /start /help), `NotificationService` (HTML-карточки, parse_mode=HTML; topicForStatus; postCard/deleteCard — переезд между темами; onNewOrder/onStatusChanged/notifyCustomerStatus/onAdminChatMessage/onCustomerChatMessage; кнопки только при https URL — Telegram отклоняет http/localhost). `config/TelegramBotConfig` регистрирует бота если BOT_TOKEN задан.
- `config/` — AppProperties (@ConfigurationProperties app.*), WebSocketConfig (STOMP /ws + JWT-интерсептор + авторизация топика /topic/orders/{id}/chat), MinioConfig, PasswordConfig (BCrypt), AdminBootstrap (создаёт админа из ADMIN_LOGIN/ADMIN_PASSWORD на ADMIN_BOOTSTRAP_TG_ID), OpenApiConfig (Bearer JWT в swagger).
- `media/` — ImageStorageService (заливка в MinIO), MediaController (если есть).
- `novaposhta/` — NovaPoshtaSyncService (@Scheduled — getWarehouses постранично в nova_poshta_warehouses) + NovaPoshtaService (cities/warehouses из БД, @Cacheable).
- `resources/db/migration/` — V1 (схема), V2 (сид: payment_options/requisites/admins), V3 (admin_users.username+password_hash), V4 (orders.approved_at/shipped_at/delivered_at/rejected_at).
- `resources/templates/home.html` — хоум-пейдж (ссылки на swagger/фронт/админку/actuator + версия билда).

### 6.2 Frontend покупателя (`tg-shop-v2/frontend`)
- `app/` — layout.tsx (подключает **telegram-web-app.js** через next/script beforeInteractive — критично для initData!; QueryClient; сцена-фон; TabBar), page.tsx (каталог: поиск+теги+grid+ProductView), cart/, checkout/ (степпер), account/ (+orders/[id] детали, +/chat).
- `components/` — TabBar (нижний glass-навбар), NotificationsBell, catalog/{ProductCard, ProductView (fullscreen), Gallery (стрелки), AddToCartControl (морф)}, chat/, ui/{GlassButton (size sm/md, variant accent=.glossy), GlassChip, GlassInput, GlassAutocomplete (НП дропдаун, iOS scroll fix), QtyStepper, RadioCard, StatusChip, Toast}, Providers (auth-boot: initData→JWT; deep-link order_<id>→чат).
- `lib/` — api.ts (fetch+Bearer, API_BASE=origin БЕЗ /api, +strip /api), telegram.ts (читает window.Telegram.WebApp.initData с ретраями), ws.ts (STOMP, origin fallback), image.tsx (imgproxy loader: resolveImageSrc — абсолютный URL→напрямую, иначе S3-ключ→imgproxy insecure), cart.ts (zustand), money.ts (÷100 → ₴).
- `app/globals.css` — **Liquid Glass v2**: НЕ зависит от backdrop-filter (плотный тинт + sheen-градиент + грани + тень; .scene живой фон; .glossy глянцевая акцент-кнопка). ⚠️ В `.glass` НЕЛЬЗЯ ставить `position` (перебьёт fixed/absolute у потребителей — навбар/стрелки).

### 6.3 Frontend админки (`tg-shop-v2/frontend-admin`, порт 3001)
- Та же стек/токены (глаss v2, чуть плотнее). `components/layout/Shell.tsx` (сайдбар+топбар+колокольчик), `components/auth/{Login (логин/пароль), AuthGate}`, `components/orders/{OrderDrawer (детали+таймлайн+чат+управление+удаление), OrdersTable (сортировка), KanbanColumn, MobileBoard}`, `app/{page (доска), products, tags, promocodes, payment, metrics, orders/[id]}`. `lib/api.ts` — adminApi (board/orders/metrics/CRUD/deleteOrder/unreadCount), JWT в sessionStorage.

### 6.4 Тулза импорта (`tg-shop-v2/migration`, package `com.maxsolch.migration`)
Plain JDBC old→new + MinIO. Шаги: tags, products(price×100), variants, product_tags, promo, media_images→MinIO (1196), product_images(url→S3-ключ), users(из заказов), orders(статус-строка→enum, address→comment, delivery=NOVA_POSHTA по умолчанию, price×100), order_items(×100), order_messages, settings. **MONEY_SCALE=100** — старая БД хранила гривны в *_minor, новая = копейки. Идемпотентно (ON DUPLICATE KEY UPDATE).

### 6.5 Инфра (`tg-shop-v2/infra` + compose)
- `nginx/nginx.conf` — кэш картинок (browser→nginx→imgproxy→minio), :8082.
- `gateway.conf` / `gateway-admin.conf` — single-origin gateway'и (/, /api, /ws, /img) для публичных туннелей (:8090 customer, :8091 admin).
- `backfill_status_times.sql` — заполнил approved/shipped/delivered/rejected_at из чат-сообщений (ОДОБРЕНО/ВЫСЛАНО/ДОСТАВЛЕНО/ОТКЛОНЕНО).
- `backfill_reject_reason.sql` — причины отказа из «❌ Причина: …».
- `np_create_topics.py` / `np_create_chat_topic.py` — создание тем форума.

---

## 7. Конфигурация (`tg-shop-v2/.env`)

Порты: backend `8080`, customer `3000`, admin `3001`, MySQL `3341`(хост)→3306, MinIO `9002/9003`, nginx-картинки `8082`, gateway customer `8090`, gateway admin `8091`.

Ключевое в .env:
- DB_*: tgshop_v2 / tgshop / tgshoppass.
- JWT_SECRET (base64), JWT_ACCESS_TTL_MINUTES=120.
- **ADMIN_LOGIN=admin / ADMIN_PASSWORD=<ADMIN_PASSWORD — см. .env>** / ADMIN_BOOTSTRAP_TG_ID=593289478.
- BOT_TOKEN=`<BOT_TOKEN — см. .env (в репо не коммитится)>` (@maxsolch_bot), BOT_USERNAME=@maxsolch_bot.
- ALLOW_UNSIGNED_INIT_DATA=true (дев; для прода false), INITDATA_TTL_SECONDS=86400.
- **NOTIFY_CHAT_ID=-1004450230956** (форум-супергруппа @maxsolch_chat, бот админ). Темы: NOTIFY_TOPIC_NEW=4, PROCESSING=5, SHIPPED=6, CLOSED=7, REJECTED=8, **CHAT=24** («Сообщения по заказам»).
- S3_* (minio/miniopass123/product-images), IMGPROXY_KEY/SALT **пустые** в деве (insecure URL), IMAGE_BASE_URL.
- WEBAPP_BASE_URL / ADMIN_BASE_URL = текущие cloudflared-URL (ЭФЕМЕРНЫЕ — меняются при перезапуске туннеля).
- NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 (origin БЕЗ /api), NEXT_PUBLIC_IMAGE_BASE_URL=http://localhost:8082/img.
- OLD_DB_URL=jdbc:mysql://localhost:3330/tg_test (root/root) — для тулзы импорта.

---

## 8. Запуск / пересборка / поддержка

**Локальный стек:**
```bash
cd tg-shop-v2
docker compose up -d --build          # mysql, minio, imgproxy, nginx, backend, frontend, frontend-admin
```
Доступы: фронт `:3000`, админка `:3001` (admin/<ADMIN_PASSWORD — см. .env>), backend `:8080` (Swagger `/swagger-ui.html`, home `/`, actuator `/actuator/health`), MinIO консоль `:9003`, картинки `:8082/img/...`.

**Импорт старой базы (одноразово):**
```bash
cd tg-shop-miniapp && docker compose -f docker-compose.local.yml up -d db   # старая БД на :3330
cd ../tg-shop-v2 && docker build -t tgshop-v2-migration ./migration
docker run --rm --network tg-shop-v2_tgshop --add-host host.docker.internal:host-gateway \
  --env-file .env -e OLD_DB_URL="jdbc:mysql://host.docker.internal:3330/tg_test?useSSL=false&allowPublicKeyRetrieval=true" \
  -e OLD_DB_USER=root -e OLD_DB_PASSWORD=root tgshop-v2-migration
# затем (для метрик/причин) прогнать infra/backfill_status_times.sql и backfill_reject_reason.sql:
docker exec -i tgshop_v2_mysql mysql --default-character-set=utf8mb4 -utgshop -ptgshoppass tgshop_v2 < infra/backfill_status_times.sql
docker exec -i tgshop_v2_mysql mysql --default-character-set=utf8mb4 -utgshop -ptgshoppass tgshop_v2 < infra/backfill_reject_reason.sql
docker compose up -d backend   # сбросить @Cacheable после импорта
```

**Публичный релиз в Telegram (cloudflared):**
```bash
cd tg-shop-v2
docker compose -f docker-compose.yml -f docker-compose.public.yml up -d --build \
  frontend-public gateway frontend-admin-public gateway-admin
# два туннеля:
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:8090   # customer → WEBAPP_BASE_URL
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:8091   # admin → ADMIN_BASE_URL
# вписать оба https-URL в .env (WEBAPP_BASE_URL / ADMIN_BASE_URL), затем:
docker compose up -d backend
# обновить кнопку-меню бота на новый WEBAPP_BASE_URL (см. infra/np_create_chat_topic.py как пример setChatMenuButton)
```

**Сборка/проверка:**
- Backend локально: `cd backend && mvn -q -B -DskipTests package` (BUILD SUCCESS).
- Фронты: `cd frontend && npm run build` / `cd frontend-admin && npm run build`; типы: `npx tsc --noEmit`.

**⚠️ Подводные камни / правила поддержки:**
1. После пересборки `frontend-public`/`frontend-admin-public` → **`restart gateway`/`gateway-admin`** (nginx кэширует IP апстрима → иначе 502).
2. cloudflared-URL **эфемерные**: сменился → обновить WEBAPP_BASE_URL/ADMIN_BASE_URL в .env → `docker compose up -d backend` → пересборка *-public + restart gateway + setChatMenuButton. (В проде уйдёт — будет домен через Caddy.)
3. NEXT_PUBLIC_* инлайнятся на **build-time**: для same-origin-сборки переданы build-args (ARG в Dockerfile фронтов). Основной фронт = localhost:8080; *-public = "" (относительный).
4. Telegram кнопки требуют **https** URL (http/localhost отклоняются) — кнопки скрыты, пока base не https.
5. В `.glass` НЕ добавлять `position` — ломает fixed/absolute (навбар/стрелки/дропдауны).
6. Картинки бэк отдаёт как `images[].url` = S3-ключ (или внешний http). Фронт строит через imgproxy (resolveImageSrc).
7. Деньги — копейки (*_minor ÷100). Старый импорт домножает ×100.
8. MySQL-консоль в Git Bash = cp1251 (кириллица = `?`): для UTF-8 — `mysql --default-character-set=utf8mb4 < file.sql > out.txt` + читать out.txt. Telegram-API запросы с кириллицей — через python `-X utf8` файлом, не через curl в bash.
9. preview-тул вешается на «живых» страницах (поллинг/анимации) — скриншоты таймаутят; реально тестировать через preview_eval/click/inspect или живой ввод.

---

## 9. Telegram-настройка (готово)

- Бот **@maxsolch_bot** (token выше). Зарегистрирован, long-polling.
- Чат **@maxsolch_chat** = форум-супергруппа, id `-1004450230956`, бот — админ с правом управления темами.
- Созданы темы (message_thread_id): 4 Новые, 5 В обработке, 6 Отправленные, 7 Завершённые, 8 Отклонённые, 24 Сообщения по заказам.
- Кнопка-меню бота настроена на WEBAPP_BASE_URL (setChatMenuButton).

---

## 10. Что проверено вживую

Бэкенд стартует (Flyway V1-V4, ddl-auto=validate ок); импорт перенёс 409 товаров / 1196 картинок / 765 заказов / 5347 сообщений; пайплайн картинок (WebP+кэш); полный цикл заказа (create→approve→ship→deliver, уведомления, чат); метрики (выручка 1.55М₴, скорость доставки реальная после backfill); админ-логин/доска/сортировка/метрики; авторизация покупателя через Telegram; навбар fixed; стрелки галереи; непрозрачный overlay; колокольчик; хард-удаление. Оба cloudflared-туннеля отдают 200.

---

## 11. Следующие шаги (для нового чата)
1. **Тесты + CI** (бэкенд: unit на расчёт заказа/скидок/стока/метрик, интеграционные на API; фронт: ключевые сценарии; GitHub Actions).
2. **Деплой на сервер** (пользователь даст SSH): перенос стека, Caddy + сертификаты + нестандартные порты вместо cloudflared, постоянные домены в WEBAPP_BASE_URL/ADMIN_BASE_URL, ALLOW_UNSIGNED_INIT_DATA=false, подписанные imgproxy-URL, сильные секреты.
3. Допилить деривацию городов НП в синке; доп. фичи по §11 дизайн-дока по желанию.

> Совет для нового чата: первым делом скажи ассистенту прочитать `HANDOFF.md`, `tg-shop-v2/docs/SPEC.md` и оба дизайн-документа — этого достаточно, чтобы продолжить без потери контекста.
