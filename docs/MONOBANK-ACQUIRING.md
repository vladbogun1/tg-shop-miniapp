# Онлайн-оплата через monobank (plata by mono) — исследование, дизайн, план

Статус: **черновик на согласование** (2026-10-05), ветка `mono-acquiring`. Кода ещё нет.
Справочник API для агентов — skill `.claude/skills/monobank-acquiring/` (официальный, + `reference/`).

> Это разворот решения из `HANDOFF.md:73` («без онлайн-эквайринга, не хотим комиссий»).
> Ручные способы (перевод на карту + скрин, передоплата + наложка) **остаются**, mono добавляется рядом.

---

## 1. Что умеет monobank (выжимка исследования)

| Что | Как |
|---|---|
| Подключение | ФОП со счётом в mono — сам в web.monobank.ua → «Інтернет» → «Управління еквайрингом», обычно ≤10 мин. Требования к сайту: украинская версия, оферта/«Про нас», контакты, у товаров фото+описание+цена — у нас всё есть. |
| Комиссия | 1,3% укр. карты, 2% иностранные. Зачисление на следующий день. |
| Авторизация | Заголовок `X-Token` на `https://api.monobank.ua`. **Тестовый токен** — https://api.monobank.ua/ (вход QR-ом из приложения), деньги не списываются, тестовая карта = любой номер по Луну. |
| Создать счёт | `POST /api/merchant/invoice/create` → `{invoiceId, pageUrl}`. Сумма в копейках, `ccy` 980. |
| Страница оплаты | `pageUrl` (pay.mbnk.biz) — карта, Apple Pay, Google Pay, оплата в приложении mono. Apple/Google Pay **не показываются на тестовом токене**. |
| Статус | Вебхук на `webHookUrl` (основной путь) + `GET /api/merchant/invoice/status` (запасной). |
| Статусы | `created → processing → success / failure`, плюс `hold`, `reversed`, `expired`. |
| Подпись вебхука | `X-Sign` = base64(DER ECDSA SHA-256 над сырым телом). Ключ — `GET /api/merchant/pubkey` (кешировать, при неудаче перезапросить 1 раз). |
| Гарантии вебхуков | До 3 попыток, пока не 200. **Порядок не гарантирован** — актуален тот, у кого больше `modifiedDate`. **На `expired` вебхука нет.** |
| Срок жизни счёта | `validity` в секундах, по умолчанию 24 ч, максимум 30 дней. |
| Возврат | `POST /api/merchant/invoice/cancel` (полный или частичный `amount`). |
| Аннулировать неоплаченный счёт | `POST /api/merchant/invoice/remove`. |
| Холд | `paymentType: "hold"` (9 дней) + `invoice/finalize` — нам не нужен (см. §6). |
| Фискализация | Связка в кабинете с checkbox / monopay / Вчасно.Каса, чек выбивается сам; тогда обязателен `basketOrder` с `code`. «Безкоштовний пРРО для онлайн-оплат». |
| Встраивание | Редирект на `pageUrl` или iframe (`displayType: "iframe"`, минимум 576×576 — для мобилки плохо). |
| SDK | Официальных нет; есть рабочий Java-пример в skill `examples/java/MonobankServer.java` (проверка подписи — оттуда). |

### Telegram: можно ли «оплатить в боте»

- **Нативные платежи Telegram** (`sendInvoice` с `provider_token`, оплата внутри Telegram): monobank в
  известных списках провайдеров **не значится** (официальный список виден только в BotFather → Payments —
  проверить владельцу). Из украинских там бывают LiqPay/Tranzzo. Значит, «нативно в боте» через mono —
  скорее всего нельзя.
- **Но это и не нужно.** Правила Telegram: цифровые товары — только Stars; для физических товаров
  можно любые провайдеры и внешние ссылки. Значит, можно:
  - в боте — сообщение с URL-кнопкой «Оплатити 1 234 ₴» → `pageUrl`;
  - в Mini App — `Telegram.WebApp.openLink(pageUrl)` (открывает браузер, Mini App не закрывается).
- Наш бот сам заказы не оформляет — заказ делается в Mini App. Поэтому «оплата в боте» = кнопка-ссылка в
  личке + оплата из Mini App.

---

## 2. Как сейчас (что трогаем)

- Нет enum способа оплаты: способы — строки `payment_options` (админка), сид: «Передоплата 100 грн» (+наложка)
  и «Полная оплата на карту». Реквизиты — `payment_requisites`.
- `orders.paid` выводится из `received_minor`; наложка = `total − received`. Ставит **только админ**
  (`PATCH /api/admin/orders/{id}/paid` → `OrderService.markPaid`). Скрин покупателя → `payment_claimed`.
- Склад списывается **сразу при создании заказа**; авто-отмены неоплаченных нет.
- Уведомления: события `OrderEvents` → Telegram-канал/топики (`NotificationService`), личка покупателю,
  Web Push админам. STOMP только для чата.
- Внешние HTTP — голый `java.net.http.HttpClient` + Jackson (стиль `NovaPoshtaSyncService`, `PushTransport`).
- Все три gateway проксируют `/api/` на бэкенд → вебхук доступен как `https://chisetup.com.ua/api/...`.
- Последняя миграция `V38` → новые с **V39**. Тесты бэкенда — Mockito, CI-джоба `backend-boot` поднимает контекст.

---

## 3. Целевой сценарий

### 3.1 Способы оплаты (предложение)

| Способ | provider | Что платит онлайн | Остальное |
|---|---|---|---|
| **Оплата карткою онлайн** (новый, первый в списке) | `MONOBANK` | вся сумма | — |
| Передоплата 100 ₴ онлайн + наложка (опционально) | `MONOBANK` | `prepayment_minor` | наложка |
| Перевод на карту (как сейчас) | `MANUAL` | — | скрин → админ |
| Передоплата 100 ₴ на карту + наложка (как сейчас) | `MANUAL` | — | скрин → админ |

Решение — у владельца (§7). Технически любая опция с `provider=MONOBANK` выставляет счёт на
«к оплате сейчас» = `requires_prepayment ? prepayment_minor : total_minor` — та же формула, что уже есть
в чекаутах.

### 3.2 Поток

```
Покупатель            Фронт (сайт / Mini App)        Бэкенд                         monobank
    | оформить ------------> POST /api/orders ---------> заказ NEW, склад списан
    |                        POST /api/me/orders/{id}/payment/mono
    |                                      ----------->  есть живой счёт? вернуть
    |                                                    иначе invoice/create ------> {invoiceId,pageUrl}
    |                        <-- {pageUrl, expiresAt}    payment_invoices: created
    | редирект / openLink ----------------------------------------------------------> страница оплаты
    |                                                    <---- вебхук (X-Sign) ------- processing/success/failure
    |                                                    проверка подписи, modifiedDate,
    |                                                    сумма/валюта → success:
    |                                                      order.received += amount, paid
    |                                                      событие PaymentReceived
    | <-- redirectUrl --------------------------------------------------------------- 
    |   страница заказа «Перевіряємо оплату…», опрос GET /api/me/orders/{id}
    |   (через ~20 с без ответа → POST .../payment/mono/refresh → invoice/status)
```

Ключевые правила:

1. **Сумму считает только бэкенд.** Фронт присылает лишь id заказа.
2. **Счёт создаётся отдельным вызовом, не внутри `createOrder`** — заказ сохраняется даже если mono
   недоступен; на странице заказа кнопка «Оплатити онлайн» позволяет повторить. Вызов mono — вне
   транзакции БД.
3. **Один живой счёт на заказ.** Повторный клик возвращает тот же `pageUrl`, если счёт `created` и не
   истёк. После `failure`/`expired` — новый счёт (старый `invoice/remove` на всякий случай).
4. **Редиректу не верим.** `redirectUrl` только возвращает человека на страницу заказа; факт оплаты —
   вебхук или наш запрос статуса.
5. **Идемпотентность вебхука**: запись по `invoiceId`; применяем, только если `modifiedDate` новее
   сохранённого; `success` к заказу применяется ровно один раз (флаг `applied_at`).
6. **Проверка суммы**: `amount` и `ccy=980` из вебхука должны совпасть с нашим счётом, иначе — в лог,
   алерт админу, заказ не трогаем.

### 3.3 Сайт (chisetup.com.ua)

- Чекаут: опция «Оплата карткою онлайн» с иконками Visa/MC/Apple Pay/Google Pay; кнопка
  «Оформити і оплатити». После `createOrder` → `payment/mono` → `window.location = pageUrl`.
- `redirectUrl` = `https://chisetup.com.ua/{locale}/account/orders/{id}?payment=return`.
- Страница заказа: состояния «Очікуємо оплату» (кнопка «Оплатити онлайн»), «Перевіряємо оплату…»
  (спиннер+опрос), «Оплачено карткою •• 1234», «Оплата не пройшла — спробувати ще раз / обрати переказ».
- iframe не берём: мин. 576×576 и проблемы с Apple Pay — редирект проще и надёжнее.

### 3.4 Mini App (app.chisetup.com.ua)

- Основной путь: `Telegram.WebApp.openLink(pageUrl)` — внешний браузер/встроенный браузер Telegram,
  Mini App остаётся открытым. Работают карта и переход в приложение mono; Apple/Google Pay — зависит от
  браузера (во внешнем — да).
- `redirectUrl` для Mini App-заказов → страница сайта `/{locale}/pay/return?order={id}`: «Оплату отримано,
  поверніться в Telegram» + кнопка `https://t.me/ChiSetupShop_bot/app?startapp=order_{id}`
  (deep link уже поддержан).
- Mini App на `visibilitychange`/`activated` перечитывает заказ и показывает итог.
- **Спайк** (проверить на устройстве): навигация самого WebView на `pageUrl` с возвратом на
  `app.chisetup.com.ua/account/orders/{id}` — UX лучше, но не ясно, переживёт ли это `initData`/авторизация.
  Если спайк неудачен — остаётся `openLink`.

### 3.5 Бот

- После создания заказа с онлайн-оплатой личка покупателю содержит URL-кнопку «Оплатити N ₴» (на `pageUrl`;
  если счёт не создан — `web_app`-кнопка на заказ).
- На `success` — личка «Оплату отримано ✅» (новое; сейчас подтверждение оплаты покупателю вообще не шлётся —
  добавим и для ручного подтверждения админом).
- Канал/топик заказов: в карточке заказа и dispatch-карточке строка «Оплачено онлайн (mono) N ₴»,
  наложка пересчитывается автоматически (уже выводится из `received_minor`).
- Web Push админам «Оплачено онлайн #…».
- Нативный `sendInvoice` — не делаем (см. §1).

### 3.6 Админка

- «Оплата» → у способа появляется переключатель «Тип: ручний переказ / monobank онлайн»; блок статуса
  интеграции: токен задан / режим test|prod / ключ получен / последний вебхук (время, статус).
- Дровер заказа: блок «Онлайн-оплата» — счета (статус, сумма, карта `maskedPan`, `paymentMethod`,
  `rrn`, комиссия `fee`), кнопки «Оновити статус», «Повернути кошти» (полностью / частично → `invoice/cancel`,
  связать с существующим `refunded_minor` / `OrderAdjustmentService`).
- `PaymentBadge`: «Оплачено · mono». Ручная кнопка «Проверить оплату» остаётся (для смешанных случаев).
- Инбокс «Внимание»: «Оплата mono не сошлась по сумме», «Возврат не прошёл».

### 3.7 Неоплаченные онлайн-заказы

Склад списан сразу, поэтому нужна политика:
- счёт живёт `validity` = **1 ч** (настройка `payment.mono.invoiceTtlMinutes`); после — можно выставить новый;
- заказ с онлайн-опцией, неоплаченный **N ч** (настройка `payment.mono.autoCancelHours`, 0 = выкл) —
  авто-`reject(NOT_PAID, restock=true)` + личка покупателю. Значение — решение владельца (§7).

---

## 4. Бэкенд — технический дизайн

### 4.1 Миграции

**V39__monobank_payments.sql**
```sql
ALTER TABLE payment_options
  ADD COLUMN provider ENUM('MANUAL','MONOBANK') NOT NULL DEFAULT 'MANUAL' AFTER prepayment_minor;

ALTER TABLE orders
  ADD COLUMN payment_provider ENUM('MANUAL','MONOBANK') NOT NULL DEFAULT 'MANUAL' AFTER payment_option_title;
  -- снапшот на момент заказа, как payment_option_title

CREATE TABLE payment_invoices (
  id               BINARY(16)   NOT NULL,
  order_id         BINARY(16)   NOT NULL,
  provider         ENUM('MONOBANK') NOT NULL,
  external_id      VARCHAR(64)  NOT NULL,          -- invoiceId
  amount_minor     BIGINT       NOT NULL,
  final_amount_minor BIGINT     NULL,              -- после возвратов
  ccy              INT          NOT NULL DEFAULT 980,
  status           VARCHAR(16)  NOT NULL,          -- created|processing|hold|success|failure|reversed|expired
  page_url         VARCHAR(512) NOT NULL,
  expires_at       DATETIME(6)  NOT NULL,
  provider_modified_at DATETIME(6) NULL,           -- modifiedDate из mono, для порядка вебхуков
  failure_reason   VARCHAR(512) NULL,
  err_code         VARCHAR(16)  NULL,
  masked_pan       VARCHAR(32)  NULL,
  payment_method   VARCHAR(16)  NULL,              -- pan|apple|google|monobank|wallet|direct
  payment_system   VARCHAR(16)  NULL,
  rrn              VARCHAR(64)  NULL,
  approval_code    VARCHAR(32)  NULL,
  fee_minor        BIGINT       NULL,
  applied_at       DATETIME(6)  NULL,              -- когда success зачтён в заказ (идемпотентность)
  created_at       DATETIME(6)  NOT NULL,
  updated_at       DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_invoices_external (provider, external_id),
  KEY ix_payment_invoices_order (order_id),
  KEY ix_payment_invoices_status (status, expires_at),
  CONSTRAINT fk_payment_invoices_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_refunds ( -- фаза 4
  id BINARY(16) NOT NULL, invoice_id BINARY(16) NOT NULL, amount_minor BIGINT NOT NULL,
  ext_ref VARCHAR(64) NOT NULL, status VARCHAR(16) NOT NULL, admin_id BINARY(16) NULL,
  created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL, PRIMARY KEY (id),
  UNIQUE KEY uq_payment_refunds_ext (ext_ref)
) ...;

CREATE TABLE payment_webhook_log (               -- сырые вебхуки, чистка > 90 дней
  id BIGINT AUTO_INCREMENT PRIMARY KEY, provider VARCHAR(16) NOT NULL,
  external_id VARCHAR(64) NULL, status VARCHAR(16) NULL, signature_ok BOOLEAN NOT NULL,
  body JSON NULL, received_at DATETIME(6) NOT NULL, KEY ix_pwl_ext (external_id)
);
```
Опционально сидом — неактивная опция «Оплата карткою онлайн» с `provider='MONOBANK'`.

### 4.2 Пакет `com.maxsolch.shop.payment.mono`

| Класс | Ответственность |
|---|---|
| `MonobankProperties` (в `AppProperties.Monobank`) | `enabled`, `token`, `apiUrl` (default `https://api.monobank.ua`), `webhookUrl` (default `${SITE_BASE_URL}/api/payments/mono/webhook`), `invoiceTtl`, `reconcileCron` |
| `MonobankClient` | `HttpClient` (connect 5 с, request 15 с) + Jackson: `createInvoice`, `getStatus`, `cancel`, `remove`, `pubkey`. Ретраи только на 429/5xx для idempotent GET. Ошибки → `MonobankException(errCode, errText, httpStatus)`. Заголовки `X-Cms: chisetup`, `X-Cms-Version`. |
| `MonobankSignatureVerifier` | Кеш `ECPublicKey`; `verify(rawBody, xSign)`; при неудаче — один перезапрос ключа (не чаще раза в минуту). Код — по `examples/java/MonobankServer.java`. |
| `OnlinePaymentService` | `startPayment(orderId, customer, channel)` → создать/переиспользовать счёт; `applyStatus(InvoiceStatusDto)` — общий для вебхука и опроса: блокировка строки счёта `FOR UPDATE`, сравнение `modifiedDate`, обновление полей, на `success` без `applied_at` → `OrderService.recordOnlinePayment(orderId, amount)`; `refund(...)`. |
| `MonobankWebhookController` | `POST /api/payments/mono/webhook`: читает тело как `byte[]`, проверяет подпись (нет → 401 + лог), пишет `payment_webhook_log`, `applyStatus`, отвечает 200. На внутреннюю ошибку → 500 (mono повторит), неизвестный `invoiceId` → 200 + лог. |
| `MonobankReconcileJob` | `@Scheduled` раз в 2–5 мин: счета `created/processing` старше 2 мин → `getStatus` → `applyStatus`; просроченные → `expired`. Плюс авто-отмена неоплаченных (§3.7). Стиль — как `PromoService.sweepExpired`, guard `AtomicBoolean`. |
| `MonobankBasketBuilder` | `basketOrder` из позиций заказа (`name`, `qty`, `sum`, `code`=SKU/id, `icon`=imgproxy URL, `unit`="шт."), промо → `discounts` VALUE; для передоплаты — одна строка «Передоплата за замовлення #XXXX». Инвариант: сумма корзины == `amount`. |

**Тело `invoice/create`:**
```json
{
  "amount": 123400, "ccy": 980,
  "merchantPaymInfo": {
    "reference": "<orderId>",
    "destination": "Оплата замовлення #A1B2C3 — ChiSetup",
    "basketOrder": [ ... ]
  },
  "redirectUrl": "https://chisetup.com.ua/uk/account/orders/<id>?payment=return",
  "webHookUrl": "https://chisetup.com.ua/api/payments/mono/webhook",
  "validity": 3600,
  "paymentType": "debit"
}
```

### 4.3 Изменения в существующем коде

- `OrderService.createOrder`: снапшот `payment_provider`.
- `OrderService.recordOnlinePayment(orderId, amountMinor)` — рядом с `markPaid`: `received += amount`
  (с потолком `total`), `paid=true`, `paidAt`, `paymentClaimed=false`; публикует **новое**
  `OrderEvents.PaymentReceived(orderId, amount, provider)`; аудит `ORDER_PAID_ONLINE` (actor = system).
- `deliver()` перетирает `received=total` — для онлайн-оплаты не ломается, но проверить тестом.
- `cancelByCustomer`: запретить, если есть счёт в `processing`; при отмене — `invoice/remove` живого счёта.
  Если оплачено онлайн — отмена только через админа (возврат).
- `OrderDetailDto` + `OrderQueryService`: `paymentProvider`, `onlinePayment {status, pageUrl (если живой),
  expiresAt, maskedPan, paymentMethod}`; админский DTO — плюс `rrn`, `fee`, список счетов.
- `PublicController /api/payment-options` — отдавать `provider`; скрывать `MONOBANK`-опции, если
  `app.monobank.enabled=false` или токен пуст.
- Слушатели: `OrderNotificationListener.onPaymentReceived` (канал/топик + личка покупателю + dispatch-карточка),
  `PushNotificationListener.onPaymentReceived`; inbox — новые правила.
- `SecurityConfig`: `permitAll` на `POST /api/payments/mono/webhook`; `RateLimitFilter` — отдельный щедрый бакет.
- `StartupSecurityCheck`: в prod при `enabled=true` без токена — не стартовать; тестовый токен в prod — warning.
- `docker-compose*.yml` / `.env.example`: `MONOBANK_ENABLED`, `MONOBANK_TOKEN`, `MONOBANK_WEBHOOK_URL` (опц.).
  Токен — только в `.env`, не в `shop_settings` (правило проекта: секреты в .env).

### 4.4 Новые эндпоинты

| Метод | Путь | Кто | Что |
|---|---|---|---|
| POST | `/api/me/orders/{id}/payment/mono` | CUSTOMER (владелец заказа) | создать/вернуть счёт → `{pageUrl, expiresAt, amountMinor}`; 409 если оплачен/отменён/не онлайн-опция |
| POST | `/api/me/orders/{id}/payment/mono/refresh` | CUSTOMER | запросить статус у mono (rate-limit 1/10 с) |
| POST | `/api/payments/mono/webhook` | public, подпись | вебхук |
| GET | `/api/admin/orders/{id}/payments` | ADMIN | счета и возвраты |
| POST | `/api/admin/orders/{id}/payments/{invoiceId}/refresh` | ADMIN | статус |
| POST | `/api/admin/orders/{id}/payments/{invoiceId}/refund` | ADMIN | `{amountMinor?}` → `invoice/cancel` |
| GET | `/api/admin/payments/mono/health` | ADMIN | токен/режим/ключ/последний вебхук (через `merchant/details`) |

### 4.5 Безопасность (чек-лист)

- Подпись `X-Sign` по сырому телу (не пере-сериализованному JSON).
- Сверка `amount`/`ccy`/`reference` с нашим счётом.
- Токен не логировать; `MonobankClient` маскирует заголовки в логах.
- Счёт создаёт только владелец заказа (как `/pay`), ID заказа из пути проверяется по `tg_user_id`.
- `redirectUrl` — только наши домены, собирается на бэкенде из `SITE_BASE_URL`.
- Двойное зачисление невозможно: `applied_at` + блокировка строки.
- `docs/SECURITY.md` дополнить: «paid ставит админ **или подтверждённый вебхук/статус mono**».

---

## 5. Фронты — что меняется

| Где | Файлы | Что |
|---|---|---|
| shared | `shared/src/orders.ts` (`paymentState`), типы API | `paymentProvider`, `onlinePayment`; новое состояние `ONLINE_PENDING` / `ONLINE_FAILED` |
| Сайт | `site/components/checkout/CheckoutView.tsx`, `site/components/order/Payment.tsx`, `OrderDetailView.tsx`, `site/lib/api.ts`, новая `app/[locale]/pay/return/page.tsx` | опция с иконками, «Оформити і оплатити», редирект, состояния оплаты, опрос, страница возврата для Mini App |
| Сайт, юр-тексты | `site/content/legal/uk/terms.md:36`, `delivery-payment.md` | убрать «немає онлайн-еквайрингу», описать оплату карткою через monobank, возвраты на картку |
| Mini App | `frontend/app/checkout/page.tsx` (PaymentStep/ConfirmStep/SuccessScreen), `frontend/app/account/orders/[id]/page.tsx`, `frontend/lib/api.ts`, `frontend/lib/telegram.ts` | `openLink(pageUrl)`, перечитывание заказа при возврате, состояния |
| Админка | `frontend-admin/app/payment/page.tsx`, `components/orders/OrderDrawer.tsx`, новый `OnlinePaymentBlock.tsx`, `PaymentBadge.tsx`, `lib/api.ts` | тип способа, статус интеграции, блок счетов, возврат |
| i18n | словари uk/ru/en | новые строки |

Дизайн — по `docs/DESIGN-V3.md` (ChiSetup, тёмная тема, акцент #FF6600).

---

## 6. Сознательно НЕ делаем (в v1)

- `hold`/`finalize` — товар на складе, подтверждать нечего; лишняя сложность.
- iframe-виджет, host-to-host Apple/Google Pay (`wallet/payment`) — нужна активация в поддержке, выигрыш мал.
- Сохранение карт/подписки, сплит, QR-кассы.
- «Оплата частинами» mono (отдельный API mono checkout) — кандидат на v2.
- Нативный `sendInvoice` в боте.
- Перекладывание комиссии 1,3% на покупателя.

---

## 7. Вопросы к владельцу (блокируют старт)

1. **Счёт ФОП в monobank есть?** Эквайринг подключается только на счёт в mono. Нужен тестовый токен
   (api.monobank.ua, вход QR) — для разработки, и позже боевой (web.monobank.ua).
2. **Какие способы оставить?** Предложение: «Оплата карткою онлайн» (первым, по умолчанию) +
   существующие ручные. Нужна ли «передоплата 100 ₴ онлайн + наложка»?
3. **Авто-статус после оплаты:** оставлять заказ в NEW (только «оплачено»), или сразу NEW → APPROVED?
   Рекомендация — только «оплачено», статус двигает админ.
4. **Авто-отмена неоплаченных онлайн-заказов** через N часов с возвратом на склад? Рекомендация — 24 ч.
5. **ПРРО/фискальные чеки:** группа ФОП? Если 2–3 группа — вероятно нужен чек; mono даёт бесплатный пРРО
   (включить в кабинете). Уточнить у бухгалтера. Мы в любом случае шлём `basketOrder` с кодами.
6. **Возвраты из админки через API в v1** или пока вручную в кабинете mono? Рекомендация — в v1 только
   полный/частичный возврат кнопкой (фаза 4), это недорого.
7. **Проверить в BotFather → Payments**, есть ли monobank среди провайдеров (если вдруг есть — можно
   рассмотреть нативную оплату в боте как v2).

---

## 8. План работ

| Фаза | Что | Результат / проверка |
|---|---|---|
| **0. Подготовка** (владелец) | ответы §7, тестовый токен в локальный `.env` | — |
| **1. Бэкенд-ядро** | V39, `MonobankClient`, verifier, `OnlinePaymentService`, вебхук, `recordOnlinePayment`, события, reconcile-job, security/rate-limit, startup-check, env | unit-тесты (подпись на фикстурах из доков, порядок `modifiedDate`, двойной `success`, несовпадение суммы, expired); `backend-boot` зелёный; локально: тестовый токен + ngrok → реальный вебхук |
| **2. Сайт** | чекаут, страница заказа, `/pay/return`, юр-тексты | ручной прогон тестовой оплаты: success, failure (карта с ошибкой из таблицы errCode), уход со страницы оплаты, повтор |
| **3. Mini App + бот** | `openLink`, возврат, опрос; личка с кнопкой «Оплатити», «Оплату отримано»; канал/dispatch; push | прогон в настоящем Telegram (iOS + Android) на стенде; спайк навигации WebView |
| **4. Админка** | тип способа, статус интеграции, блок счетов, возврат, бейдж, инбокс | e2e Playwright: `13-online-payment.spec.ts` (вебхук мокается подписанной фикстурой) |
| **5. Стенд и прод** | демо-стенд demo.chisetup.com.ua с тестовым токеном → прод с боевым, опция выключена → включить; тестовый платёж 1 ₴ + возврат | релиз `v3.x.0`, миграция V39, `rollback.sh`, заметка в `DEPLOY-SERVER.md` |

Оценка: фаза 1 — самая важная и большая; 2–4 можно параллелить после того, как зафиксирован API (§4.4).

### Тестирование локально

1. Тестовый токен → `.env`: `MONOBANK_ENABLED=true`, `MONOBANK_TOKEN=...`.
2. `ngrok http 8080` (или порт gateway-site) → `MONOBANK_WEBHOOK_URL=https://<ngrok>/api/payments/mono/webhook`.
3. Опция «Оплата карткою онлайн» в админке → заказ → страница mono → любая карта по Луну.
4. Проверить: вебхук в `payment_webhook_log`, `signature_ok=1`, заказ `paid`, личка/push.
5. Пропущенный вебхук: остановить ngrok, оплатить, убедиться, что reconcile-job/refresh подтянул статус.

---

## 9. Риски

| Риск | Что делаем |
|---|---|
| Вебхук потерян (3 попытки, наш даунтайм при деплое) | reconcile-job + refresh с фронта |
| Вебхуки не по порядку | `modifiedDate` + блокировка строки |
| Покупатель заплатил по старому счёту после выставления нового | оба счёта живут в `payment_invoices`; второй `success` → `received` упирается в `total`, переплата → алерт «Переплата, сделать возврат» в инбокс; при новом счёте старый `invoice/remove` |
| Mini App: оплата во внешнем браузере, человек не вернулся | личка «Оплату отримано» + перечитывание при возврате |
| Склад «завис» на неоплаченных | авто-отмена (§3.7) |
| Фискализация включена, а корзина ≠ сумме | `MonobankBasketBuilder` + тест на инвариант |
| Тестовый токен уехал на прод | startup-check: warning + бейдж «TEST» в админке |
