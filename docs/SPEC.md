# tg-shop-v2 — технический контракт (canonical)

Единый источник правды для всех подсистем (backend / frontend / infra / migration).
Полное обоснование решений — в `../../ДИЗАЙН-ДОКУМЕНТ-новый-проект.md`.

## Версии
- Java 21
- Spring Boot 3.4.x (стабильный, зрелая поддержка springdoc/telegrambots/flyway)
- MySQL 8.4
- Flyway (из BOM Spring Boot)
- telegrambots-spring-boot-starter 6.9.7.1
- springdoc-openapi-starter-webmvc-ui 2.7.x
- jjwt 0.12.x
- minio java sdk 8.5.x
- Caffeine cache (spring-boot-starter-cache)
- Next.js 15 + TypeScript + Tailwind CSS v4 + TanStack Query + @telegram-apps/sdk-react

## Java packages
- backend: `com.maxsolch.shop`
- migration tool: `com.maxsolch.migration`

## Порты (docker-compose, infra)
| сервис | внутр. | хост |
|---|---|---|
| backend (Spring) | 8080 | 8080 |
| frontend (Next) | 3000 | 3000 |
| mysql (новая БД) | 3306 | 3341 |
| minio API | 9000 | 9000 |
| minio console | 9001 | 9001 |
| imgproxy | 8080 | — (только внутри сети) |
| nginx (кэш картинок) | 80 | 8082 |

Картинки наружу: `http://<host>:8082/img/...` (nginx → imgproxy → minio).

## Переменные окружения (.env)
```
# DB (новая)
DB_HOST=mysql
DB_PORT=3306
DB_NAME=tgshop_v2
DB_USER=tgshop
DB_PASSWORD=change_me
DB_ROOT_PASSWORD=change_me_root

# JWT
JWT_SECRET=base64-256bit-secret-change-me
JWT_ACCESS_TTL_MINUTES=120

# Telegram
BOT_TOKEN=
BOT_USERNAME=@ChannelCheckerBot
ADMIN_USER_IDS=593289478,977067472
INITDATA_TTL_SECONDS=86400
ALLOW_UNSIGNED_INIT_DATA=false

# Telegram notify channels (мультигруппа со старого прода)
NOTIFY_CHAT_ID=-1003606305228
NOTIFY_TOPIC_NEW=2049
NOTIFY_TOPIC_PROCESSING=2051
NOTIFY_TOPIC_SHIPPED=2053
NOTIFY_TOPIC_CLOSED=2055

# URLs
WEBAPP_BASE_URL=
ADMIN_BASE_URL=

# MinIO / S3
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=change_me_minio
S3_BUCKET=product-images

# imgproxy
IMGPROXY_KEY=<hex>
IMGPROXY_SALT=<hex>
IMAGE_BASE_URL=http://localhost:8082/img

# Old DB (для миграционной тулзы)
OLD_DB_URL=jdbc:mysql://localhost:3330/tg_test
OLD_DB_USER=root
OLD_DB_PASSWORD=root
```

## REST API контракт (v1, базовый — расширяется)
База `/api`. Аутентификация: `Authorization: Bearer <JWT>`.
- Роли: `CUSTOMER`, `ADMIN`.
- Покупатель: `POST /api/auth/telegram` { initData } → { accessToken, user }. Остальные покупательские эндпоинты требуют CUSTOMER-JWT.
- Админ: `POST /api/auth/admin/telegram` { initData } (или Login Widget) → { accessToken } с ролью ADMIN. Админ-эндпоинты помечены `@RequiredAdmin`.
- Публичное (без токена): `GET /api/app-info`, `GET /api/products`, `GET /api/products/{id}`, `GET /api/tags`.
- Картинки: фронт строит URL через imgproxy-loader на `IMAGE_BASE_URL`.

Swagger: `/swagger-ui.html`. Home (Thymeleaf): `/`. Actuator: `/actuator/*`.

## Деньги
Целые минорные единицы (`*_minor`), валюта по умолчанию `UAH`.

## Статусы и enum'ы (см. схему)
- order status: `NEW, APPROVED, SHIPPED, DELIVERED, REJECTED`
- delivery_method: `NOVA_POSHTA, PICKUP`
- order_messages.sender_type: `CUSTOMER, ADMIN, SYSTEM`
- order_messages.type: `TEXT, PHOTO, FILE, SYSTEM`
- admin role: `ADMIN, SUPER_ADMIN`

---

# Фаза 2 — полный API-контракт (canonical для всех агентов)

## Общее
- JWT в `Authorization: Bearer`. Роли ROLE_CUSTOMER / ROLE_ADMIN.
- Все id товаров/заказов/тегов/промо/вариантов/оплаты — UUID-строки. Деньги — минорные единицы (копейки).
- Изображения: DTO отдаёт `images:[{id,url,sortOrder}]`, где `url` = S3-ключ (или внешний http). Фронт строит через imgproxy.

## OrderService (BE-1 владелец; публичный API сервиса для BE-2/BE-3)
- `Order createOrder(CreateOrderCommand)` — валидация наличия/вариантов, промо, скидка (фикс приоритетнее %), списание стока, currency=UAH, сохраняет delivery+payment, статус NEW; шлёт уведомления (NotificationService.onNewOrder).
- `Order approve(UUID)`, `Order ship(UUID, trackingNumber)`, `Order deliver(UUID)`, `Order reject(UUID, reason)` — переходы статуса с валидацией; reject возвращает сток; каждый вызывает NotificationService.onStatusChanged + notifyCustomerStatus.
- `Order changeStatus(UUID, OrderStatus, trackingNumber?, reason?)` — диспетчер для админки/канбана.

## Customer API (ROLE_CUSTOMER)
- POST `/api/orders` — body CreateOrderRequest { items:[{productId,variantId?,quantity}], customerName, phone, comment?, promoCode?, deliveryMethod(NOVA_POSHTA|PICKUP), npCityRef?, npCityName?, npWarehouseRef?, npWarehouseName?, paymentOptionId } → { orderId }.
- GET `/api/me` → профиль + admin флаг.
- GET `/api/me/orders` → [OrderSummaryDto{ id, status, totalMinor, currency, createdAt, itemsCount, unreadCount }].
- GET `/api/me/orders/{id}` → OrderDetailDto{ id,status,subtotalMinor,discountMinor,totalMinor,currency,customerName,phone,comment,promoCode, deliveryMethod,npCityName,npWarehouseName, paymentOptionTitle, trackingNumber, rejectReason, items:[OrderItemDto], requisites:PaymentRequisitesDto, createdAt }.
- GET `/api/me/orders/{id}/messages` → [MessageDto].
- POST `/api/me/orders/{id}/messages` — { text?, type(TEXT|PHOTO|FILE), attachmentUrl?, fileName?, mimeType?, replyToMessageId? } → MessageDto (persists + broadcast WS; NOT ping bot — customer is sender).
- POST `/api/me/orders/{id}/messages/read` → 204 (set read_at on ADMIN msgs).
- POST `/api/me/uploads` (multipart) → { url:key } — customer chat attachment upload to MinIO.

## Public API
- GET `/api/app-info`, `/api/products`, `/api/products/{id}`, `/api/tags` (как в Фазе 1).
- GET `/api/payment-options` → [PaymentOptionDto{ id,title,description,requiresPrepayment,prepaymentMinor }].
- GET `/api/np/cities?q=` → [{ ref, name, area }] (из локальной БД/кэша).
- GET `/api/np/warehouses?cityRef=&q=` → [{ ref, number, description, type }].

## Admin API (@RequiredAdmin)
- Products: GET `/api/admin/products`, GET `/api/admin/products/archived`, POST `/api/admin/products`, PATCH `/api/admin/products/{id}`, PATCH `/api/admin/products/{id}/active` {active}, PATCH `/api/admin/products/{id}/archived` {archived}. Create/Update body: { title,description,priceMinor,currency,stock,active, imageKeys:[String], tagIds:[uuid], variants:[{name,stock}] }.
- POST `/api/admin/uploads` (multipart file) → { key } — заливает оригинал в MinIO (ключ products/{uuid}/{filename}), возвращает ключ для imageKeys.
- Tags: GET/POST `/api/admin/tags`, PATCH/DELETE `/api/admin/tags/{id}`.
- Promo: GET/POST `/api/admin/promocodes`, PATCH/DELETE `/api/admin/promocodes/{id}`.
- Orders: GET `/api/admin/orders/board` → { columns: { NEW:[OrderCardDto], APPROVED:[...], SHIPPED:[...], DELIVERED:[...], REJECTED:[...] } }; GET `/api/admin/orders?status=&q=&page=&size=` (таблица); GET `/api/admin/orders/{id}` → OrderDetailDto (+ tg user); PATCH `/api/admin/orders/{id}/status` { status, trackingNumber?, rejectReason? }; DELETE `/api/admin/orders/{id}`.
- Order chat (admin side): GET `/api/admin/orders/{id}/messages`, POST `/api/admin/orders/{id}/messages` (ADMIN sender → persists + WS broadcast + **ping customer via bot**), POST `/api/admin/orders/{id}/messages/read`.
- Payment settings: GET `/api/admin/payment-options`, PUT `/api/admin/payment-options` (replace list), GET `/api/admin/payment-requisites`, PUT `/api/admin/payment-requisites`.
- OrderCardDto{ id, customerName, totalMinor, currency, itemsCount, deliveryMethod, paymentOptionTitle, unreadCount, createdAt, status }.

## WebSocket (realtime чат)
- STOMP endpoint `/ws` (SockJS), JWT в CONNECT header `Authorization` или query `?token=`.
- Топик `/topic/orders/{orderId}/chat` — новые MessageDto. Доступ: владелец заказа (CUSTOMER) или ADMIN (проверка в ChannelInterceptor).
- Отправка — через REST (persist + `SimpMessagingTemplate.convertAndSend`). 
- MessageDto{ id, orderId, senderType(CUSTOMER|ADMIN|SYSTEM), senderName, type, text, attachmentUrl, fileName, mimeType, replyToMessageId, createdAt, readAt }.

## Бот (тонкий, BE-3)
- Регистрируется с BOT_TOKEN. Команды: `/start` → текст + кнопка-WebApp «🛍️ Открыть магазин» (WEBAPP_BASE_URL). `/help`.
- NotificationService.onNewOrder(order): постит карточку в NOTIFY_CHAT_ID (канал @maxsolch_chat) с inline-кнопками: «🔎 Открыть в админке» (URL = ADMIN_BASE_URL + "/orders/" + id), «💬 Чат» (URL). Сохраняет notify_message_id.
- onStatusChanged(order): редактирует карточку (или удаляет старую и постит новую) с новым статусом.
- notifyCustomerStatus(order): DM покупателю (по tg_user_id) о смене статуса (если tg_user_id>0).
- onAdminChatMessage(order): когда админ пишет в чат заказа → DM покупателю «💬 Новое сообщение по заказу #<id>» + кнопка-WebApp «Открыть переписку» (WEBAPP_BASE_URL deep-link на чат заказа, напр. ?startapp=order_<id> или ?orderId=<id>).
- Все вызовы best-effort (try/catch, лог).

## Nova Poshta (BE-3)
- NovaPoshtaSyncService `@Scheduled(cron daily)` + ручной триггер: POST https://api.novaposhta.ua/v2.0/json/ method getWarehouses (постранично, page/limit), upsert в nova_poshta_warehouses (+ агрегировать города в nova_poshta_cities). На старте, если таблица пустая — синк. Кэш Caffeine на cities/warehouses ответы.

## Frontend
- Customer (FE-1): app/ маршруты shop (есть), product (sheet), cart, checkout (stepper), account (orders list), account/orders/[id] (detail + chat). Zustand для корзины (persist localStorage). WS клиент (@stomp/stompjs) для чата. Telegram MainButton на чекаут. Деньги money() ÷100.
- Admin (FE-2): отдельная зона `app/admin/*` (или подприложение). Auth через Telegram (POST /api/auth/admin/telegram) или dev-логин. Канбан-доска (dnd-kit) `/admin` (board), разворот заказа (drawer) с деталями+чатом, `/admin/products` CRUD + загрузка картинок, `/admin/tags`, `/admin/promocodes`, `/admin/payment` (настройки оплаты). Desktop-first, мобильный фолбэк (канбан→таб-список). Liquid glass (можно «admin-glass», чуть плотнее).
- NEXT_PUBLIC_API_BASE_URL = origin БЕЗ /api. Image base = imgproxy.
