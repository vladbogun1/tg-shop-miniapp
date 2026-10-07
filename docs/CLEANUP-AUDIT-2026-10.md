# Аудит мёртвого и легаси-кода — 2026-10-07

> **Статус: выполнено в ветке `cleanup-2026-10`** (фронты и документация — ветка `cln-fe`, бэкенд и
> инфраструктура — параллельно другим исполнителем). Ниже — исходный аудит, этот блок — итог.
>
> **Сделано (фронты, shared, docs):**
> - Реквизиты (карта, IBAN) вырезаны из `ДИЗАЙН-ДОКУМЕНТ-новый-проект.md` и `HANDOFF.md`. В истории
>   git и в `backend/.../V2__seed.sql` (накатанная миграция, править нельзя) они остаются — считать раскрытыми.
> - P1: удалены методы API-клиентов без вызовов (`sendAnalytics`, `conversations`, `broadcastAdmins`,
>   `siteRevalidateStatus`, сайт `getPaymentOptions`), файлы `SoonPanel`, `ui/Chip`, `lib/cn` (Mini App, сайт),
>   `@dnd-kit/sortable`, все функции из списка + найденное knip'ом (`STATUS_EMOJI`, неиспользуемые
>   ре-экспорты `imgproxyUrl`, `toMajor/toMinor`, `MessageType/OrderItem` и др.), ключи i18n — Mini App 6
>   (сверх списка `soon.badge`), сайт 12 (сверх списка `chat.replyTo`), из всех трёх языков.
> - P2 CSS: токены `--glow`, `--c2/--c4/--c5` (на сайте и `--c3`), все неиспользуемые `@theme`-утилиты,
>   классы `.scene`/`.glass--*`/`.accent-fill`/`.glossy`/`.nb-up`/`.hud-frame--sm`/`.text-gradient`/`.no-scrollbar`
>   в админке, `.nb-flat`/`.chamfer` в Mini App; в админке сверх списка — `--grad-accent*`, `--r-pill`,
>   `--shadow-accent`, `--border*`, `--accent-2`, `--r`, `--r-card`, `--faint`. Проверено сравнением
>   собранного CSS до/после: исчезли только эти правила.
> - Дубли → `@shop/shared`: `phone.ts`, i18n-ядро (`locales` + `types` + `active` → `shared/src/i18n.ts`),
>   `spring`/`noFadeFlash` (`shared/src/motion.ts`, `site/lib/motion.ts` удалён), `maxQty`.
> - Документы архивированы в `docs/archive/` (с README), README и docs обновлены под chisetup.com.ua,
>   edge Caddy, monobank v3.9.0, 2FA, дизайн v3; упомянуты удалённые `migration/`, «закрытый сайт»,
>   Thymeleaf-страница и V48 (точка невозврата для отката).
>
> **Оставлено сознательно:**
> - Хук `useOrderLimits` (`lib/order-limits.ts`) — у Mini App и сайта свой: зависит от своего api и
>   стора корзины, а React-хук в barrel `@shop/shared` попал бы в граф серверных компонентов сайта.
>   В shared вынесен только чистый `maxQty`.
> - Варианты анимаций Mini App и админки (`lib/motion.ts`) — значения у приложений разные.
> - knip: «неиспользуемые» экспорты, которые используются внутри своего файла, `public/sw.js`,
>   `scripts/build-pwa-icons.mjs`, `eslint-config-next` — не мёртвые.
> - РНОКПП в юридических страницах и футере сайта — обязательные реквизиты продавца.


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
