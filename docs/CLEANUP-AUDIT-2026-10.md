# Аудит мёртвого и легаси-кода — 2026-10-07

Срез: `v3.10.0` (5e48091). Только чтение, ничего не удалено. Два прохода: бэкенд (`backend/`, `bots/`, `migration/`, `infra/`) и фронты (`frontend/`, `site/`, `frontend-admin/`, `shared/`, `e2e/`, docs).

**Итог в одну строку:** старая оплата на карту, старый домен и старый вход в админку из кода вычищены, остались хвосты в БД, документации и мелкий мёртвый код. Срочное — одно: **реальный номер карты и IBAN лежат в публичном репо** (`ДИЗАЙН-ДОКУМЕНТ-новый-проект.md:241`), и в проде в таблице `payment_requisites`.

## Срочно

| Что | Где | Действие |
|---|---|---|
| Номер карты и IBAN в публичном git | `ДИЗАЙН-ДОКУМЕНТ-новый-проект.md:241` | Вырезать из файла. Из истории git они не исчезнут — если критично, переписать историю или считать данные раскрытыми |

## P1 — безопасно удалить сразу

**Бэкенд**
- Мёртвые методы репозиториев: `OrderRepository.countByStatusSearch`, `countsByStatus`; `NovaPoshtaCityRepository.findTop50ByName…`; `OrderMessageRepository.findByOrderIdOrderByCreatedAtAsc`; `PaymentInvoiceRepository.findByOrderIdInOrderByCreatedAtDesc`; `ProductImageRepository.findFirstByProduct_Id…`.
- Мёртвые методы: `MessageService.unreadForAdmin(byte[])`, `NotificationService.onApprovedDispatch`, `MonobankException.getHttpStatus`.
- Эндпоинт `GET /api/tags` (`CatalogController:45`) — никто не вызывает.
- Свойство `s3.publicEndpoint` / `S3_PUBLIC_ENDPOINT` — никто не читает.
- Ключи `api.error.notAuthenticated`, `bot.openShop` в `messages*.properties`.
- `DOMAIN=maxsolkh.shop` в `.env.example`; комментарии про `:666/:667` (`docker-compose.prod.yml`, `gateway-site.conf.template`, `AuthController`, `CookieOriginGuard`); комментарии «скриншоты перевода» в `MediaSigner`/`OrderService`/`ImageStorageService`.

**Фронты**
- Методы API-клиента без вызовов: `customerApi.sendAnalytics`, `adminApi.conversations` (+ типы), `adminApi.broadcastAdmins`, `adminApi.siteRevalidateStatus` (дубль `settingsApi.revalidateStatus`), `site/lib/server-api.ts getPaymentOptions`.
- Файлы: `frontend/components/SoonPanel.tsx`, `frontend/components/ui/Chip.tsx`, `frontend/lib/cn.ts`, `site/lib/cn.ts`.
- Зависимость `@dnd-kit/sortable` в frontend-admin.
- Неиспользуемые функции: motion-пресеты (`springSoft` и др. в трёх `lib/motion.ts`), `LogoMark`, `SkeletonText`, `kindLabel`, `hoursLabel`, `STATUS_COLOR`, `rangeLabel`, `ORDER_LIST_KEYS`, `localeTag`, `normalizeLocale`, `isPrefixed`, `shared clampQty`, `SupportErrorCode`.
- Ключи i18n без использования: Mini App — `theme.toggle` (легаси v2), `cancel.title`, `cancel.toChat`, `checkout.submitPay`, `checkout.delivery.change`; сайт — 12 ключей (`common.placeholder`, `home.hero.title`, `cart.subtotal/openPage/clamped`, `checkout.warehouse/submitPay`, `account.orders.open`, `chat.reply`, `chat.cancelReply`, `np.confirm`). Удалять из всех трёх языков.

## P2 — с небольшой проверкой

- CSS-остатки дизайна v2: токены `--glow`, `--c2…--c5`, неиспользуемые `@theme`-утилиты, классы `.scene`, `.glass--strong/floating`, `.accent-fill`, `.glossy`, `.nb-up`, `.text-gradient` и др. в админке; `.nb-flat`, `.chamfer` в Mini App. Нужна визуальная проверка после.
- `OrderMessage.width/height` — поля без использования (колонки всегда NULL).
- Метрики: устаревшие `TODO settings` и захардкоженный `LOW_STOCK_DAYS = 14` в `StockCalculator`/`ReorderCalculator`, хотя настройки `metrics.lowStockDays/deadStockDays` уже есть.
- Дубли утилит в бэкенде: `cut()` ×9, `blankToNull` ×9, HTML-`esc()` ×5, своё форматирование денег в `PushNotificationListener` → вынести в `common/`.
- Дубли фронтов → `shared/`: `lib/phone.ts` и `i18n/types.ts` (100% копии), `i18n/locales.ts`, `i18n/active.ts`, `lib/motion.ts`, `lib/order-limits.ts`.
- Одноразовые скрипты `infra/np_create_topics.py`, `np_create_chat_topic.py` — удалить или в архив.

## P3 — решает владелец

| Что | Почему вопрос |
|---|---|
| Колонки `orders.payment_claimed*`, таблица `payment_requisites` (там номер карты), ENUM `PAYMENT_REQUISITES` | Оставлены ради отката на v3.8. Когда откат не нужен — экспорт и DROP одной миграцией |
| Таблица `settings` (V1) и модуль `migration/` | Перенос со старой базы давно выполнен; модуль в архив, таблицу удалить после проверки |
| «Закрытый сайт» с кодом доступа (`SITE_GATE_CODE`, заглушка с брендом MAXSOLCH) | Сайт открыт с v2.9.0; нужен ли гейт демо-стенду |
| Thymeleaf + `HomeController` (служебная страница `/` бэкенда) | В проде недоступна; health даёт actuator |
| `infra/ngrok-policy.yml`, дефолт `@ChannelCheckerBot` | Используются ли локально |

## Документация

**Архивировать** (`docs/archive/`): `HANDOFF.md` (июнь, v2), `AUDIT-FIXES.md`, `UI-FIXES.md`, `I18N.md`, оба `ДИЗАЙН-ДОКУМЕНТ-*.md` (вырезав карту), `frontend/docs/NEO.md`, `frontend-admin/docs/NEO.md`, `docs/brand/*` кроме `v3/`, `docs/FEATURE-order-gifts-discounts-stockvalue.md`.

**Обновить** — описывают старый домен `maxsolkh.shop:666/:667` или устаревший статус: `README.md` (Neo-Brutalism, нет сайта/monobank/2FA, битые скриншоты), `docs/TLS-RENEWAL.md` (сейчас edge_caddy + EdgeDeck), `docs/DEPLOY-SERVER.md`, `docs/SECURITY.md`, `docs/DESIGN-V3.md`, `docs/SITE-SPEC.md` («эквайринга нет»), `docs/MONOBANK-ACQUIRING.md` и `docs/ORDERS-SUPPORT-REVIEWS.md` («в разработке», хотя в проде).

## Не трогать (выглядит как легаси, но нужно)

- Caddy-редирект `:666/:667` → chisetup.com.ua — старые кнопки бота.
- `POST /api/auth/admin/telegram` — первый шаг входа в админку из Telegram, дальше 2FA.
- `PATCH /api/admin/orders/{id}/paid`, `POST /api/me/uploads` (чат), `/api/admin/ping` (e2e).
- `PAYMENT_REQUISITES` в метках журнала, `CARD_*` в метриках, `?payment=claimed`, редирект `checkout/success` — совместимость со старыми данными и ссылками.
- `?tgstub=` — только в dev-сборке.

## Что проверено и чисто

Все пути API во фронтах существуют в бэкенде; эндпоинтов-сирот кроме `/api/tags` нет. Закомментированного кода и `@Deprecated` нет. Все ключи `SettingsRegistry` используются. Зависимости pom.xml используются. Ассеты в `public/` используются. e2e-тестов на удалённые фичи нет. `bots/invite-bot` чистый.
