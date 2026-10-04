# Безопасность: что настроено и что проверить перед выкаткой

Документ описывает механизмы, которые уже работают в коде, и чек-лист, без которого
выкатывать на прод нельзя.

---

## 1. Обязательный чек-лист перед деплоем

| Проверка | Как убедиться |
|---|---|
| `SPRING_PROFILES_ACTIVE` ≠ `dev` | `docker-compose.prod.yml` выставляет `prod`. Вне `dev` бэкенд **не стартует** с `ALLOW_UNSIGNED_INIT_DATA=true`, с плейсхолдерным `JWT_SECRET` или `ADMIN_PASSWORD` — см. `StartupSecurityCheck`. |
| `ALLOW_UNSIGNED_INIT_DATA=false` | С этим флагом подпись Telegram initData не проверяется вообще: любой может выпустить себе ADMIN-токен на 30 дней. |
| `JWT_SECRET` сгенерирован | `openssl rand -base64 32`. Плейсхолдер из `application.yml` публичный. |
| `ADMIN_PASSWORD` не из `.env.example` | Смена пароля бампает `admin_users.token_version` и отзывает все ранее выданные токены. |
| Порты БД и MinIO не наружу | `docker-compose.prod.yml` снимает публикацию у `mysql`, `minio`, `nginx`, `backend`. Проверить: `docker compose ... ps` — наружу торчит только Caddy (666/667). |
| Swagger / Actuator недоступны снаружи | Оба gateway отдают 404 на `/swagger-ui`, `/v3/api-docs`, `/actuator`. `/actuator/**` кроме `health`/`info` требует роль ADMIN. |
| Бакет MinIO приватный | `mc anonymous get local/<bucket>` → `none`. Вложения чата (скриншоты переводов с номерами карт) не должны быть публичными. |
| `WEBAPP_BASE_URL` / `ADMIN_BASE_URL` заданы | Это единственные разрешённые CORS/WebSocket origin вне профиля `dev`. |

---

## 2. Аутентификация

**Покупатель.** `POST /api/auth/telegram` c `initData` → JWT роли `CUSTOMER`. Подпись проверяется
по официальному алгоритму Telegram (HMAC-SHA256 с ключом `HMAC("WebAppData", bot_token)`),
сравнение — за константное время, плюс TTL по `auth_date`.

**Админ.** Либо `POST /api/auth/admin/telegram` (telegram id должен быть активным в `admin_users`),
либо `POST /api/auth/admin/login` (логин + BCrypt-пароль). Оба доступны **только через админский
gateway (:667)**: в `gateway.conf` (:666) и `gateway-site.conf.template` (сайт) `/api/auth/admin/` → 404.
При неизвестном логине BCrypt всё равно выполняется (фиктивный хэш) — по времени ответа не видно,
существует ли логин.

**Срок жизни admin-токена** — `ADMIN_TOKEN_TTL_MINUTES` (12 ч), а не 30 дней, как у покупателя.
Пока админка открыта и работает, она сама перевыпускает токен после половины срока
(`POST /api/admin/token/refresh`); брошенная вкладка просто истекает.

**Отзыв токенов.** JWT stateless и живёт 30 дней, поэтому деактивация админа или смена пароля
раньше ничего не меняли. Теперь у токена есть claim `tv`, который сверяется с
`admin_users.token_version` (`AdminTokenValidator`, кэш 30 c). Смена пароля увеличивает версию —
все старые токены умирают.
- «Выйти» (`POST /api/admin/logout`) отзывает только текущий токен: у admin-JWT есть `jti`, он кладётся
  в `admin_revoked_tokens` (V23) до истечения токена.
- «Выйти на всех устройствах» (`POST /api/admin/logout-all`) — `token_version + 1`.
- Открытый WebSocket админа перепроверяет токен на каждом SUBSCRIBE и на каждом сообщении к нему;
  отозванный/истёкший — сессия закрывается ERROR-фреймом.

**Rate limiting.** `RateLimitFilter`: 10 попыток / 5 мин на `/api/auth/admin/*` (по IP), 60 / 5 мин на
`/api/auth/telegram` (каждый запуск Mini App; покупатели за мобильным NAT делят один IP), 30/мин на
загрузки, 120/мин на публичные каталог, Нову Пошту и превью промокодов. Плюс в `AuthService`
не больше 10 неудачных паролей в час **на логин** — независимо от IP.

**IP клиента** — `server.forward-headers-strategy: native` (Tomcat RemoteIpValve): `X-Forwarded-For`
читается справа налево, свои прокси (приватные/loopback-адреса) пропускаются, первый чужой адрес —
клиент. Раньше брался самый левый адрес — то, что прислал сам клиент. Требование к прокси перед
gateway: дописывать реальный адрес (`$proxy_add_x_forwarded_for` или `$remote_addr`), иначе весь
трафик сайта будет выглядеть как один адрес хоста. Для входа на сайт —
отдельно: `POST /api/auth/web/start` 10/мин, остальные `/api/auth/web/*` (опрос статуса) 90/мин.

**Покупатель на сайте (maxsolkh.shop).** Вход только через бота: `start` → deep link
`/start login_<nonce>` → в боте нужно выбрать число, показанное на сайте (защита от подсунутой
чужой ссылки) → `complete`. В БД — только SHA-256 от nonce, `login_bind` и refresh-токена.
Cookies `HttpOnly` + `SameSite=Lax` + `Secure` (`WEB_COOKIE_SECURE`, в `dev` выключен):
`access` (JWT 15 мин, claim `chn=web`), `refresh` (30 дней, путь `/api/auth/web`, ротация;
повтор старого токена позже 20 с отзывает сессию), `login_bind` (5 мин). Токен сайта
принимается, только пока жива строка `web_sessions` (кэш 30 с) — «Завершить сессию» в боте или
в кабинете действует сразу. Изменяющие запросы с cookie-авторизацией и все
`/api/auth/web/complete|refresh|logout` проверяют `Origin`/`Referer` (`CookieOriginGuard`);
без обоих заголовков — 403. `POST /api/auth/web/dev-login` существует только в профиле `dev`.
Чек-лист прода: `SITE_BASE_URL=https://maxsolkh.shop`, `WEB_COOKIE_SECURE=true`,
`SITE_REVALIDATE_SECRET` сгенерирован и совпадает у backend и site.

---

## 3. Файлы и картинки

- **Бакет приватный.** imgproxy читает оригиналы по S3-креденшелам; публичный доступ ему не нужен.
- **Вложения чата** (`chat/*`) отдаёт бэкенд: `GET /api/media?key=…&exp=…&sig=…`. Подпись — HMAC
  от ключа объекта и срока жизни (1 час), потому что `<img src>` не умеет отправлять заголовок
  `Authorization`. Ссылки выдаёт только API и только тем, кто и так имеет доступ к чату заказа.
- **Загрузки** проверяются `UploadValidator`: whitelist content-type И расширения, лимит 15 МБ
  (`spring.servlet.multipart`). Без этого в чат можно было залить `.html`/`.svg` — хранимая XSS
  против админа, который по нему кликнет.
- **imgproxy** ограничен `IMGPROXY_ALLOWED_SOURCES` префиксом `s3://<bucket>/products/`: иначе
  неподписанный imgproxy — открытый прокси, а при доступе ко всему бакету через `/img/` без подписи
  и навсегда читались бы вложения чата (`chat/`). Вложения админа в чат тоже кладутся в `chat/`
  (`POST /api/admin/orders/{id}/attachments`). Плюс `limit_req`/`limit_conn` на `/img` в nginx: ресайз это CPU.

---

## 4. Деньги

Покупатель **не может** пометить заказ оплаченным. Загрузка скриншота ставит только
`orders.payment_claimed` («оплата на проверке»); `paid` и `received_minor` меняет исключительно
админ через `PATCH /api/admin/orders/{id}/paid`. До подтверждения наложенный платёж в карточке
отгрузки остаётся полным.

Остатки списываются под `SELECT … FOR UPDATE` (продукты лочатся в порядке id, чтобы не поймать
дедлок), промокод — тоже, так что лимит использований нельзя обойти параллельными заказами.
Создание заказа идемпотентно по заголовку `Idempotency-Key`.

---

## 5. Журнал действий

`admin_audit_log` (+ `GET /api/admin/audit`) фиксирует: смену статуса, подтверждение и снятие
оплаты, скидки, подарки, изменение состава, удаление заказа, правки товаров, промокодов, тегов,
реквизитов и запуск рассылок — с телеграм-id и именем админа. Таблица append-only.

---

## 6. Заголовки и изоляция

- Клиентский gateway и сам Next отдают `Content-Security-Policy: frame-ancestors` с доменами
  Telegram (X-Frame-Options: DENY сломал бы Mini App в веб-клиенте), админка — `frame-ancestors 'none'`
  + `X-Frame-Options: DENY`.
- Везде `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  HSTS на gateway.
- CORS и WebSocket-origin берутся из одного списка (`AllowedOrigins`); localhost и туннели
  добавляются только в профиле `dev`.

---

## 7. Реквизиты в сиде

Миграция `V2__seed.sql` содержит номер карты, IBAN, ФИО и РНОКПП. **Это тестовые данные**
(подтверждено владельцем 2026-09-17), поэтому файл остаётся как есть — тем более что править
накатанную миграцию нельзя: Flyway сверяет контрольную сумму и упал бы на всех существующих БД.

Правило на будущее: боевые реквизиты задаются только через админку
(«Оплата» → «Реквизиты») и в репозиторий не коммитятся.
