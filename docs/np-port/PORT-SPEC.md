# Перенос «Нової пошти» с ветки `np-integration` на master (архитектура v2) — карта для builder'ов

Дата: 2026-11-12. Цель: к утру всё, что было в `np-integration` (этапы 0–4 + упаковка + ревью + «ТТН устарела»),
работает на текущем master, по правилам `docs/ARCHITECTURE.md` и `docs/ARCHITECTURE-FRONT.md`, в дизайне админки v3.50+.

## 0. Источник правды

- **Поведение и контракт API (URL, JSON)** — ветка `np-integration` (локальная, `git show np-integration:<путь>`).
  Полный дифф: `git diff $(git merge-base np-integration origin/master) np-integration -- <путь>`.
  Читать документы ветки: `docs/NOVA-POSHTA-PLAN.md` (раздел «Ответы владельца»), `docs/NOVA-POSHTA-PRINT.md`,
  `D:\CLOUDE\apps\maxsolch\shop\docs\np-review-2026-10-23.md` (ревью и что исправлено), `...\docs\np-shipments-audit-2026-10.md` (упаковка §5).
- **Структура кода** — master. Старые файлы ветки (`service/OrderService`, `web/dto/*`, `novaposhta/*`, `shared/*`,
  `frontend-admin/components/orders/*`, `site/components/checkout/*`) в master не существуют — логику переносим в модули,
  не возрождаем старые пакеты.
- **Миграция** — уже лежит: `backend/src/main/resources/db/migration/V98__nova_poshta.sql` (= V65+V66+V67 ветки). Имена колонок
  те же, что в ветке → сущности ветки переносятся по полям 1:1. Не менять V98 без согласования с brain; следующая свободная — V99.
- Скилл `.claude/skills/nova-poshta/` (справочник API НП) — уже в ветке.

## 1. Бэкенд: куда что кладём

Направление модулей: `inbox` → … → `returns, payment, delivery` → `order` → `cart, promo` → … → `catalog` → … → `settings` → `platform`.
`delivery` может звать `order.app` и `catalog.app`; `order` НЕ знает `delivery` — только через интерфейсы, которые объявляет `order/app`
(как `OrderReturnsView` реализован в `returns`).

| Ветка | master |
|---|---|
| `domain/NpServiceType` | `order/domain/NpServiceType` (поле заказа) |
| поля заказа (np_service_type, np_street_*, np_building, np_flat, recipient_*_name, payment_on_delivery) | `order/domain/Order` / `OrderColumns` + методы агрегата (`deliverTo` расширить), без сеттеров снаружи |
| правки `OrderService.createOrder` (проверка доставки по способу, ФИО раздельно, оплата при получении) | `order/app/Checkout` / `OrderPlacement` + новый класс-сценарий при необходимости |
| проверка ref отделения/улицы/категории/лимитов поштомата при оформлении | интерфейс `order/app/DeliveryAddressCheck` (объявляет order) → реализация `delivery/app/CheckoutAddressCheck` |
| запрет одобрять неоплаченный (кроме «при отриманні») | `order/domain/Order.approve` / `OrderGuard` + `order` error enum |
| правка доставки в админке (тип, адрес, ФИО по частям) | `order/app/OrderDeliveryEditing` |
| запрет правок заказа после сдачи посылки | `order/app/OrderGuard` через интерфейс `order/app/OrderShipmentView` (см. ниже) |
| `payment_options.kind/delivery_methods`, вариант ON_DELIVERY, `payment.onDelivery*` настройки, автоотмена «при отриманні» | `payment` (опции) + `order/app/PaymentEligibility`/`OrderPaymentOptions` + `*Settings` модуля |
| вес/габариты товара/варианта/категории (+ поля в админских DTO товара и категории) | `catalog/domain` сущности + `catalog/api` DTO + `catalog/app` чтение для `delivery` |
| `novaposhta/NovaPoshtaApiClient` | порт `delivery/domain/NovaPoshtaApi` (уже есть, расширить) + `delivery/infra/NovaPoshtaHttpClient` через `platform.http` |
| `NpTrackingPushClient` (новый API, JWT) | порт в `delivery/domain` + клиент в `delivery/infra` |
| `OrderShipment`, `ShipmentStage`, `ShipmentStatusMapper`, `ShipmentStaleness`, `WaybillRequest` | `delivery/domain` (сущность С ПОВЕДЕНИЕМ, чистые правила) |
| `OrderShipmentRepository`, репозиторий `np_webhook_events` | `delivery/infra` |
| `ShipmentService` (1150 строк!) | `delivery/app`: разрезать по действиям — создание, правка/пересоздание, удаление, печать, пакет «для всех» … (≤ 400 строк/файл, ≤ 80/метод) |
| `ShipmentTrackingService` + `ShipmentTrackingJob` | `delivery/app/*` + `delivery/app/ShipmentJobs` с `@Scheduled` + `@SchedulerLock` |
| `NovaPoshtaSenderService`, `NovaPoshtaPriceService`, `ParcelSizeService` | `delivery/app` |
| `NpWebhookService` / `NpWebhookController` / `AdminNpWebhookController` | `delivery/app` / `delivery/api` |
| `AdminNovaPoshtaController`, `AdminShipmentController`, `NpCheckoutController` | `delivery/api` (тонкие; URL как в ветке) |
| `ShipmentAutoCreateListener`, `ShipmentCleanupListener`, `ShipmentSyncListener` | `delivery/app`, `@OnCommitted` на события `order.domain.OrderEvents` |
| `ShipmentInboxSource`, `NpAlerts` | `inbox` модуль (он выше delivery) читает `delivery.app` |
| уведомления покупателю («прибыло», платное хранение) | `delivery/app/ShipmentNotifier` через порты `notification` (+ добавить в `V2Rules.TELEGRAM_USERS`) |
| `SettingsRegistry` (+206 строк) | `delivery/app/DeliverySettings` (уже есть) и `*Settings` нужных модулей — реестр по одному на модуль |
| `AppProperties` (ключи NP, dry-run, webhook) | `delivery/infra/DeliveryProperties` (уже есть), имена env те же: `NOVAPOSHTA_API_KEY`, `NP_DRY_RUN`, `NOVAPOSHTA_WEBHOOK_SECRET`, `NOVAPOSHTA_WEBHOOK_URL` |
| фиксы справочника (тип POINT был «вантажне», `getWarehouseTypes`, закрытые отделения через `seen_at` TIMESTAMP(0) — время запуска обрезать до секунд, лимиты поштомата) | существующие `delivery/app/NovaPoshtaSyncService`, `NovaPoshtaUpsertService`, `NovaPoshtaService` |
| DTO ТТН в ответах заказа (`ShipmentDto` в `OrderDetailDto`, `DispatchOrderDto`, `OrderSummaryDto`, детали заказа покупателя) | JSON как в ветке. `order/app` объявляет `OrderShipmentView` (краткая ТТН по id заказов: номер, стадия, статус, напечатана, устарела, прибыла, платное хранение с …, ссылка трекинга, «сдана в НП» для запрета правок) → реализует `delivery/app` |

Общие правила (иначе CI красный): ошибки — `DomainException` + `DeliveryError`/`OrderError`/… + 4 строки в `i18n/messages*.properties`;
время — `Clock`/`ShopZone`; события — `DomainEvents.publish` + `@OnCommitted`; замки — только БД (`platform.jobs.DbLocks`);
`@Value` нельзя; файл ≤ 400 строк, метод ≤ 80; `v2-baseline.txt` пустой — не пополнять.

### 1.1. Решения по связке с фичами, появившимися после ветки (обязательно)

1. **Двойная ТТН.** Выкатка без даунтайма держит два бэкенда одновременно. Создание ТТН (кнопка, пакет, авто при одобрении)
   — под замком `DbLocks` `np-ttn:<id заказа>` + повторная проверка активной ТТН внутри; вызов НП — вне транзакции БД.
   Опрос/вебхук — `@SchedulerLock` и optimistic lock `version`.
2. **Заказы не удаляются (архив).** `ShipmentCleanupListener` слушает отклонение/отмену/архив/слияние (источник) вместо удаления:
   активная ТТН, ещё не сданная в НП (стадия CREATED), созданная нами (origin API) → удалить в НП; не вышло → `sync_error` + «Внимание».
   Сданную в НП не трогать.
3. **Обмен (returns) очищает ТТН** → то же удаление в НП (пункт «Что осталось» плана — закрыть).
4. **Слияние заказов.** Источник — как п.2; у цели ТТН становится «устаревшей» через отпечаток состава (`goods_key`).
5. **Отказ / возврат в НП** (стадии REFUSED/RETURNING) → только «Внимание» с подсказкой запустить мастер возврата
   («Не забрал на почте — едет назад» уже есть в returns), деньги автоматически не двигаем.
6. **Доплата «Наложкой»** и любой остаток к оплате → сумма наложки ТТН = остаток к оплате из `OrderMoney`
   (у «при отриманні» — вся сумма). Расхождение наложки с ТТН → «ТТН устарела».
7. **Метка «проблемный покупатель»** (только полная оплата онлайн) → вариант «Оплата при отриманні» ему не предлагается и
   отклоняется сервером.
8. **Предоплата 100 ₴ / monobank** не меняются; ON_DELIVERY = 0 ₴ онлайн.
9. **Решения владельца (23.10 + 12.11):** отправка из Харкова №65 (по умолчанию) или №104; доставку платит получатель;
   SHIPPED — когда НП приняла (код 4+), до этого «ТТН создана»; неоплаченный заказ одобрить нельзя (кроме «при отриманні»);
   **на проде включаем всё**: трекинг, ТТН по кнопке, новый чекаут, оплату при получении, авто-ТТН при одобрении.
   Комиссия наложки: «Контроль оплати» 2 % + 20 ₴ (подтверждено боевой ТТН) — подсказка одной цифрой.

## 2. Админка (`frontend-admin`)

Код — `features/<фича>/{api.ts,keys.ts,queries/,ui/,model/}`, страницы в `app/` тонкие. Типы ответов — только из
`packages/core/src/api/generated.d.ts`. Компоненты — из `@shop/ui` (Modal/Sheet/useConfirm/useApiMutation/useForm/toast) и
готовые компоненты редизайна (ActionMenu, кнопки, бейджи, токены). Тексты админки — по-русски в JSX.
**Разметку ветки не переносим — переносим поведение, вёрстку собираем из компонентов master** (это и есть «адаптировать дизайн»).

Что перенести (по ветке): блок ТТН в карточке/шторке заказа (создать / пересоздать / удалить / печать, «ТТН устарела» баннер+окно,
статус посылки), окно правки доставки (отделение / поштомат / курьер, ФИО по частям), «К отправке» (`features/dispatch`):
«Створити ТТН для всіх» с выбором отделения отправки, печать одним PDF 100×100 / 85×85 / A4, бейдж «устарела» и запрет печати,
настройки НП в «Настройках» (отправитель и его отделения, коробки-пресеты, заполнение, умолчания, вебхук-подписка, «создавать ТТН
при одобрении»), вес/габариты в товаре/варианте/категории, вид варианта оплаты (kind, способы доставки) в «Оплате»,
строки «Внимание» (NP_SYSTEM, STALE, расхождение наложки, отказ/возврат). Поиск по настройкам с украинским написанием —
если в master у «Настроек» уже есть свой поиск/разделы, встроить туда, а не тащить `sections.ts` ветки.

## 3. Покупатель (`packages/customer`, `site`, `frontend`)

Общая логика оформления/доставки — `packages/customer/src/{checkout,delivery}`, общий словарь `packages/customer/src/i18n/shared-{uk,ru,en}.ts`.
Что перенести: вкладки доставки (отделение / поштомат / курьер / самовывоз), поиск улиц, ПІБ раздельно, «≈ N ₴ орієнтовно»
(одной цифрой с комиссией наложки), «Оплата при отриманні» (если включена и доступна), подстановка из прошлого заказа по ref,
текст «доставку оплачуєте окремо Новій пошті», на сайте — ввод вручную по умолчанию и карта по переключателю с подтверждением
точки (`useNpMapPick`), в заказе покупателя — ТТН, статус посылки, ссылка «Відстежити». Юридические страницы
`site/content/legal/{uk,ru,en}/{delivery-payment,returns,terms}.md` — правки ветки. Поддержка iOS 15.4+ / Chrome 92+ (без lookbehind).

## 4. Проверки (все — до «готово»)

- Бэкенд: `cd backend && mvn -q test` (включает ArchUnit v2, `ClassSizeTest`, `ErrorCatalogTest`, OpenAPI-снимок).
  Контракт: `mvn test -Dtest=OpenApiSnapshotTest -Dopenapi.update=true`, затем в корне `npm run gen:api`.
- Фронты: `npm run lint && npm run typecheck && npm run test && npm run arch:front && npm run build`,
  `node scripts/check-browser-compat.mjs site frontend`, `npm run check:bundle`. Храповики только вниз.
- e2e админки — `npm run e2e` (Docker).
- Жёстко: `NP_DRY_RUN=true` везде; **боевые ТТН не создавать**; ТТН 20451569101973 не трогать; ключ ФОП и секрет вебхука
  в git не писать (репо публичное). Ключ для локальных проверок — `D:\CLOUDE\_private\nova-poshta.env` (только чтение справочников/цен).
