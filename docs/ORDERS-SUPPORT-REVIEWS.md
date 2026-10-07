# Заказ → оплата/отмена, поддержка, отзывы, защита от ботов

Статус: в разработке (2026-10-05), ветка `mono-acquiring`, демо-стенд. Решения владельца + дефолты разработчика.
Все лимиты — **настройки в админке** (SettingsRegistry → «Настройки»), значения ниже — по умолчанию.

## Фаза A. Шаг «заказ создан», отмена покупателем, защита от ботов (V42)

**Поток.** Чекаут → «Оформити замовлення» → экран/страница заказа «Замовлення #XXXX створено»:
сумма к оплате, отсчёт до `paymentDueAt` (24 ч), кнопки **«Оплатити»** (встроенное окно monobank) и
**«Скасувати замовлення»**. Окно оплаты само больше НЕ открывается.

**Отмена покупателем.**
| Состояние заказа | Что может покупатель |
|---|---|
| не оплачен, NEW/APPROVED | «Скасувати» → сразу REJECTED (CHANGED_MIND), товар на склад, счета закрываются |
| оплачен (полностью или предоплата), NEW/APPROVED | «Запросити скасування» (причина обязательна) → заявка PENDING; админ: **«Одобрить»** = отмена + склад + полный возврат на карту через monobank; **«Отклонить»** с комментарием → покупателю в личку/на страницу заказа. Одна активная заявка; после отклонения — повторно нельзя (пишет в чат заказа) |
| SHIPPED / DELIVERED | отмены нет; ссылка на «Повернення» и чат заказа |
| банк обрабатывает платёж | отмена недоступна, «зачекайте хвилину» |

Админ: строка во «Внимании» «Запрос отмены», карточка в заказе, Telegram + push.

**Защита от ботов/скупки (группа «Защита от ботов и спама»).**
| Ключ | По умолч. | Смысл |
|---|---|---|
| `antibot.maxUnpaidOrders` | 2 | сколько неоплаченных заказов одновременно у покупателя |
| `antibot.orderCooldownSec` | 60 | пауза между заказами |
| `antibot.maxOrdersPerDay` | 5 | заказов за 24 ч |
| `antibot.maxQtyPerProduct` | 5 | штук одного товара в заказе |
| `antibot.maxUnitsPerOrder` | 20 | всего штук в заказе |
| `antibot.maxSelfCancelsPerDay` | 3 | своих отмен за 24 ч, после — новые заказы блокируются до конца окна |
Плюс IP-лимит на `POST /api/orders` в RateLimitFilter. Покупатель всегда авторизован через Telegram — это
первый барьер. Ошибки — понятным текстом («у вас уже 2 неоплаченных замовлення — оплатіть або скасуйте»).

### Фаза A — что сделано (2026-10-05)

**Миграция `V42__order_cancel_requests_antibot.sql`:** в `orders` — `cancel_request_status` (PENDING|APPROVED|DECLINED,
NULL = не было), `cancel_request_reason` (≤500), `cancel_requested_at`, `cancel_request_resolved_at`,
`cancel_request_admin_comment` (≤1000), `cancelled_by_customer` (отмена по инициативе покупателя — сразу или
одобренный запрос; админские отклонения не ставят) + индекс `idx_orders_user_created (user_id, created_at)`.

**API покупателя:**
- `POST /api/me/orders/{id}/cancel {reason?}` — неоплаченный NEW/APPROVED → сразу REJECTED (CHANGED_MIND), склад,
  счета monobank закрываются. Коды 400: `PAID_NEEDS_REQUEST` (деньги уже пришли → запрос), `CANNOT_CANCEL`
  (отправлен/закрыт), `PAYMENT_IN_PROGRESS` (банк обрабатывает платёж).
- `POST /api/me/orders/{id}/cancel-request {reason}` — оплаченный NEW/APPROVED; причина обязательна, ≤500.
  Коды 400: `CANCEL_REQUEST_EXISTS` (уже есть — PENDING или решён; после DECLINED текст «напишите в чат»),
  `CANCEL_REQUEST_UNPAID`, `CANNOT_CANCEL`, `PAYMENT_IN_PROGRESS`.
- `GET /api/public/order-limits` → `{maxQtyPerProduct, maxUnitsPerOrder, maxUnpaidOrders, orderCooldownSec,
  maxOrdersPerDay, maxSelfCancelsPerDay}` (0 = без лимита) — степперы корзины/товара режутся по `maxQtyPerProduct`.
- `OrderDetailDto` += `cancelRequestStatus/Reason/RequestedAt/ResolvedAt/AdminComment`; `OrderSummaryDto` и
  `OrderCardDto` += `cancelRequestStatus`. Общий хелпер `customerCancelMode()` в `shared/src/orders.ts`
  (CANCEL | REQUEST | PENDING | DECLINED | APPROVED | PROCESSING | RETURNS | NONE).

**API админа** (`AdminCancelRequestController`):
- `POST /api/admin/orders/{id}/cancel-request/approve {comment?}` → обновляет статус счетов; если банк ещё
  обрабатывает — 400 `PAYMENT_IN_PROGRESS`; иначе в одной транзакции REJECTED (CHANGED_MIND) + склад + заявка
  APPROVED, затем (вне транзакции) полный `OnlinePaymentService.refund(order, invoice, null)` по каждому
  оплаченному счёту. Ответ `{order, refundRequestedMinor, refundedInvoices, refundErrors[], manualRefundMinor}`
  (manual = получено не через monobank — вернуть руками). Аудит `ORDER_CANCEL_REQUEST_APPROVE`.
- `POST /api/admin/orders/{id}/cancel-request/decline {comment}` (обязателен, ≤1000) → DECLINED. Аудит
  `ORDER_CANCEL_REQUEST_DECLINE`. Код 400 без активной заявки: `NO_PENDING_REQUEST`.
- Ручной reject заказа с PENDING-заявкой закрывает её как APPROVED (возврат — на усмотрение админа, «Внимание»
  продолжит напоминать «Оплачен, но отменён — верните деньги»).

**Уведомления:** события `OrderEvents.CancelRequested` / `CancelRequestResolved` → Telegram-канал (топик чата)
«🛑 Запрос отмены» + push админам; покупателю личка `bot.cancelRequest.approved|declined` (uk/ru/en). При
одобрении покупатель получает ещё и обычное сообщение о смене статуса (отменён).
**«Внимание»:** группа PAYMENT, строка «Запрос отмены — одобрите или отклоните · {причина}» для PENDING
(NEW/APPROVED); заменяет строку «Оплачен онлайн — подтвердите заказ» этого заказа. Чип «Отмена?» на карточке доски.

**Защита от ботов** (`OrderGuard` + `OrderGuardStore`, вызывается в `OrderController` до `createOrder`, после
проверки Idempotency-Key): 400 `QTY_LIMIT` (штук одного товара/варианта или всего), 400 `TOO_MANY_UNPAID`,
429 `ORDER_COOLDOWN` / `ORDER_DAILY_LIMIT` / `CANCEL_LIMIT` с `Retry-After` и `retryAfterSec` в теле
(`TooManyRequestsException`). Тексты — `api.antibot.*` (uk/ru/en). Настройки — группа `antibot` «Защита от
ботов и спама», ключи из таблицы выше, у всех 0 = выкл. IP-лимит: `POST /api/orders` — 10 за 10 мин на IP.
Проверка не под блокировкой: два одновременных заказа в одну секунду могут оба пройти (тормоз, не учёт).

**UI.** Сайт и Mini App: после «Оформити замовлення» (сумма к оплате — подписью под кнопкой) — страница заказа
с `?created=1`: «Замовлення #… створено», сумма, отсчёт до `paymentDueAt`, «Оплатити {сума}» (встроенное окно
monobank), «Скасувати замовлення»; окно оплаты само не открывается. Ниже — блок отмены по `customerCancelMode`:
диалог с необязательной причиной / форма запроса (обязательная причина, счётчик 500) / карточки
«надіслано» / «відхилено + коментар магазину + чат» / «погоджено, гроші повертаються» / «банк обробляє — зачекайте»
(кнопка неактивна) / отправлен → сайт: ссылка на `/returns`, Mini App: текст про чат. Ошибки лимитов показываются
текстом сервера, для `TOO_MANY_UNPAID` — ссылка «Мої замовлення». Админка: блок «Запрос отмены» в карточке
заказа (причина, время, «Одобрить и вернуть деньги» — модалка с суммой возврата и пометкой о складе;
«Отклонить» — комментарий обязателен), иконка группы настроек.

**Тесты:** `OrderGuardTest`, `OrderCancelRequestTest`, `CancelRequestServiceTest`, кейс в `InboxRulesTest`.

## Фаза B. Поддержка (вопросы до покупки) (V43)

Обращения (`support_threads` + `support_messages`), не привязанные к заказу: **«Запитати про товар»** на
карточке товара (тема = товар) и **«Підтримка»** в меню/футере (общий вопрос). Только после входа через
Telegram (гость на сайте → вход через бота). Реальное время — STOMP, как чат заказа; ответ админа →
личка ботом с кнопкой. Админка: раздел «Поддержка» (список, фильтры открытые/все, ответ, закрыть),
«Внимание», Telegram-топик чата, push. Картинки — как в чате заказа.

| Ключ | По умолч. | Смысл |
|---|---|---|
| `support.enabled` | true | показывать поддержку |
| `support.cooldownSec` | 10 | пауза между сообщениями |
| `support.maxMessagesPerHour` | 30 | сообщений в час от покупателя |
| `support.maxOpenThreads` | 3 | открытых обращений одновременно |
| `support.maxLength` | 2000 | символов в сообщении |
| `support.autoCloseDays` | 7 | закрыть обращение без активности |

### Фаза B — что сделано (2026-10-05)

**БД (V43).** `support_threads` (id BINARY(16), user_id/tg_user_id, customer_name, снимок товара
product_id/title/slug/image_url, subject, status OPEN|CLOSED, source MINIAPP|WEB, last_message_at,
last_sender, last_preview, customer_unread/admin_unread, awaiting_since — с какого сообщения покупатель
ждёт ответа, created_at, closed_at, closed_by CUSTOMER|ADMIN|AUTO) и `support_messages` (как
order_messages: sender CUSTOMER|ADMIN|SYSTEM, sender_id/name, type, text, вложение, reply_to, created_at,
read_at). FK на товар — `ON DELETE SET NULL`, снимок остаётся.

**Бэкенд — пакет `com.maxsolch.shop.support`.**
- Покупатель `/api/me/support`: `GET config`, `GET unread-count`, `GET threads`, `POST threads`
  `{productId?, subject?, text?, type?, attachmentUrl?, fileName?, mimeType?}` (вопрос о товаре, по
  которому уже есть открытое обращение, дописывается в него), `GET threads/{id}`,
  `GET threads/{id}/messages?before&limit`, `POST threads/{id}/messages` (в закрытое — переоткрывает),
  `POST threads/{id}/read`, `POST threads/{id}/close`. Гостю — `GET /api/public/support/config`.
  Чужое обращение → 403. Вложения — существующий `POST /api/me/uploads`, только свои ключи `chat/u{id}/`.
- Админ `/api/admin/support`: `GET unread-count` (открытые, ждущие ответа), `GET threads?filter=open|awaiting|closed|all&q=`,
  `GET threads/{id}`, `GET/POST threads/{id}/messages`, `POST threads/{id}/attachments`,
  `POST threads/{id}/read|close|reopen`. Ответ админа снимает «ждёт ответа» и читает сообщения покупателя.
- STOMP `/topic/support/{threadId}` (SupportMessage) — подписка: владелец обращения или любой админ
  (проверка в `WebSocketConfig`, как у чата заказа).
- Лимиты (группа настроек «Поддержка», 0 = без ограничения) проверяются на сервере с кодами:
  `SUPPORT_DISABLED`, `SUPPORT_COOLDOWN`, `SUPPORT_HOURLY_LIMIT` (по всем обращениям покупателя),
  `SUPPORT_TOO_MANY_THREADS`, `SUPPORT_TOO_LONG`; тексты uk/ru/en (`api.support.*`). Админ отвечает
  и при выключенной поддержке. Плюс IP-лимит 30 POST/мин на `/api/me/support/**` (RateLimitFilter).
- Автозакрытие (`SupportJobs`, раз в час): открытые без сообщений дольше `support.autoCloseDays`;
  обращение, где покупатель ждёт ответа, само не закрывается — оно висит во «Внимании».
- Уведомления (`SupportNotifier`, после коммита): сообщение покупателя → Telegram-топик чата
  (`NOTIFY_TOPIC_CHAT`, «🛟 Поддержка · новый вопрос», имя + товар, кнопка в админку `/support?thread=`)
  + Web Push админам (без текста сообщения); ответ админа → личка ботом на языке покупателя
  (`bot.support.*`) с кнопкой web_app `startapp=support_<threadId>`.
- «Внимание»: новый вид `SUPPORT` «Вопросы в поддержку» — открытые обращения с `awaiting_since`
  (через `InboxExtraSource`, общий механизм для строк других модулей), просрочка — 2 ч, версия строки —
  время последнего сообщения (новое сообщение возвращает отложенную строку).
- Тесты: `SupportServiceTest` — выключено, длина, пустое, пауза, час, лимит открытых, слияние по товару,
  снимок товара, чужое вложение, переоткрытие с лимитом, владение (403), STOMP-владелец, ответ админа,
  закрытие, автозакрытие, строка «Внимания».

**Mini App.** Аккаунт → строка «Підтримка» (бейдж непрочитанных) → `/account/support` (список,
«Поставити питання») → `/account/support/{id}/chat` (чат как у заказа: MessageBubble, фото, вставка,
«раньше», STOMP, закрыть; `id=new` — черновик, первое сообщение создаёт обращение). Карточка товара →
«Запитати про товар» → `/account/support/new/chat?product=<id>`. Диплинк `support_<id>` в `Providers.tsx`.

**Сайт.** Карточка товара → «Запитати про товар» (`AskProductButton`): вошедшему — диалог с вопросом,
гостю — вход через бота `/login?next=/account/support/new?product=<id>`. «Підтримка» в шапке (и в меню
аккаунта, непрочитанное суммируется с заказами), в футере и во вкладках кабинета. Страницы
`/[locale]/account/support` (список), `/new` (общий вопрос или `?product=`), `/[id]` (чат на
`MessageBubble`, STOMP через `connectOrderChat({topic})`, закрыть/переоткрыть). Всё скрыто, если
`support.enabled = false` (`SupportGate`, `/api/public/support/config`). Ключи `support.*` в uk/ru/en.

**Админка.** Раздел «Поддержка» (`/support`, пункт меню с бейджем ждущих ответа): фильтры «Ждут
ответа / Открытые / Закрытые / Все», поиск, карточки (покупатель, товар, превью, время, статус,
непрочитанное); обращение в дровере — товар, покупатель, источник, закрыть/открыть снова, чат
(вложения, STOMP). Диплинк `/support?thread=<id>` (Telegram, push, «Внимание»). «Внимание»: вид
`SUPPORT`, кнопка «Ответить» ведёт в обращение. Настройки: группа «Поддержка».

## Фаза C. Отзывы и бонус (V44)

- Оставить отзыв можно только по **доставленному** (DELIVERED) заказу — на каждый товар заказа один отзыв:
  оценка 1–5 + текст. Видны всем на карточке товара (сайт и Mini App): средняя оценка, число, список.
  Сайт: `aggregateRating`/`review` в JSON-LD товара.
- Премодерация (настройка): админ публикует/скрывает, может ответить публично.
- **Бонус:** за первый опубликованный отзыв по заказу — личный промокод **−5%** (настройка), одноразовый,
  только для этого покупателя, действует 60 дней (настройка). Приходит в личку ботом и виден в кабинете.
- Напоминание в личку после доставки: «Залиште відгук — отримайте −5%» (через N дней, настройка).

| Ключ | По умолч. | Смысл |
|---|---|---|
| `reviews.enabled` | true | |
| `reviews.premoderation` | true | публиковать после проверки админом |
| `reviews.bonusPercent` | 5 | скидка бонусного промокода (0 = без бонуса) |
| `reviews.bonusValidDays` | 60 | срок действия бонуса |
| `reviews.minLength` | 10 | минимум символов |
| `reviews.reminderDays` | 2 | через сколько дней после доставки напомнить (0 = не напоминать) |
| `reviews.maxPerDay` | 10 | отзывов в сутки от покупателя |

### Фаза C — что сделано (2026-10-05)

**БД (V44 `V44__reviews.sql`).** `product_reviews` (id, product_id, order_id, order_item_id UNIQUE — один
отзыв на строку заказа, user_id, tg_user_id, author_name — снимок «Олена К.», rating 1–5 (CHECK), text ≤ 4000,
status PENDING|PUBLISHED|HIDDEN, admin_reply, admin_reply_at, created_at, updated_at, published_at); FK на
заказ/строку — `ON DELETE SET NULL` (удаление заказа админом не стирает отзыв с карточки). `products.rating_avg`
DECIMAL(3,2) + `rating_count` — агрегат, пересчитывается SQL-ом при публикации/скрытии/удалении (каталожные
DTO читают его бесплатно). `promo_codes`: `owner_user_id` (личный код), `expires_at`, `source` (`REVIEW_BONUS`),
`source_order_id`. `orders`: `review_bonus_issued_at` (один бонус на заказ — атомарный
`update … where … is null`), `review_reminder_sent_at`.

**Личные промокоды.** `PromoService.personalRejection` (владелец + срок) проверяется везде, где код
валидируется/применяется: `preview` (гость → «це особистий промокод — увійдіть»), `reserve` (корзина),
`OrderService.resolvePromo` (оформление и ручное применение админом — владелец = покупатель заказа).
Чужой личный код отвечает как «не знайдено», просроченный — «більше не діє».

**Бэкенд — пакет `com.maxsolch.shop.review`.** `ReviewRules` (чистые правила), `ReviewService`, `ReviewStore`
(JDBC: флаги заказа, агрегат, выборка напоминаний), `ReviewNotifier` (личка ботом, push админам),
`ReviewReminderJob`, `ReviewInboxSource`.
- Публично: `GET /api/public/products/{id|slug}/reviews?page=&size=` — опубликованные, новые сверху,
  `summary {avg, count, distribution[1★..5★]}`; `ratingAvg`/`ratingCount` в `ProductDto` (Mini App и сайт).
- Покупатель: `GET /api/me/reviews/pending[?orderId=]` (строки доставленных заказов без отзыва; подарки и
  полностью возвращённые — нет), `POST /api/me/reviews {orderItemId, rating, text}` (свой PENDING можно
  отправить повторно = правка; ответ `{review, bonus?}`), `GET /api/me/reviews`, `GET /api/me/bonuses`
  (ACTIVE/USED/EXPIRED). Ошибки 400 с текстами `api.review.*` (uk/ru/en): выключено, не ваш, не доставлен,
  нельзя, уже есть, уже проверен, оценка, коротко/длинно (`reviews.minLength`), лимит в сутки.
- Админ: `GET /api/admin/reviews?status=&productId=&page=&size=` (+ счётчики по статусам),
  `POST {id}/publish|hide|reply`, `DELETE {id}`; аудит `REVIEW_PUBLISH/HIDE/REPLY/REPLY_REMOVE/DELETE`
  (entity `REVIEW`). Новый отзыв при премодерации → push админам «Новый отзыв на модерации».
- Бонус: когда отзыв заказа впервые становится PUBLISHED (сразу без премодерации или по «Опубликовать») —
  код `THANKS-XXXXXX` (алфавит без 0/O/1/I), `bonusPercent` %, maxUses 1, owner = автор, expires = now +
  `bonusValidDays`, source `REVIEW_BONUS`; личка ботом `bot.review.bonus.*`. `bonusPercent = 0` — без бонуса.
  Повторная публикация/второй отзыв того же заказа бонуса не даёт.
- Напоминание: раз в 30 мин — DELIVERED, доставлен ≥ `reminderDays` и не больше 14 дней сверх (чтобы
  включение фичи не разослало всем старым заказам), есть строки без отзыва, бот не заблокирован,
  напоминания ещё не было (флаг ставится до отправки). Учитывает `reviews.enabled`, `reminderDays = 0` и
  `notify.customerStatus`. Кнопка web_app `startapp=view_<orderId>` → страница заказа с формой.
- «Внимание»: вид `REVIEW` «Отзывы на модерации» (через `InboxExtraSource`), версия — время правки,
  просрочка — 24 ч. Настройки — группа «Отзывы».
- Кэши `products`/`productById` сбрасываются после коммита, страница товара на сайте ревалидируется.

**Сайт.** Карточка товара: звёзды + средняя + число у заголовка (якорь к отзывам), секция отзывов (сводка с
распределением, список, ответ магазина, «Показати ще»), первая страница рендерится на сервере; JSON-LD
`aggregateRating` + до 5 `review` только при count > 0 (`site/lib/reviews-ld.ts`); рейтинг на карточках
каталога. Кабинет → «Відгуки» (`/account/reviews`): чекають на відгук (звёзды + текст), мої відгуки со
статусами и правкой PENDING, мої бонуси с копированием. Доставленный заказ → CTA «Залиште відгук — −5%».

**Mini App.** Карточка товара: рейтинг + отзывы с пагинацией; доставленный заказ — карточка с формами по
строкам заказа (после отправки — спасибо и бонус-код с копированием); аккаунт → «Відгуки»
(`/account/reviews`: ожидающие, мои, бонусы). Личный код работает в поле промокода корзины.

**Админка.** Раздел «Отзывы» (`/reviews`, бейдж = группа REVIEW во «Внимании»): фильтры На модерации /
Опубликованы / Скрытые / Все, карточки (звёзды, текст, автор/покупатель, товар, заказ), Опубликовать,
Скрыть, Ответить, Удалить; строки REVIEW во «Внимании» ведут в раздел; в «Промокодах» — бейдж личного
бонус-кода и срок действия.

**Тесты:** `ReviewRulesTest` (только DELIVERED, свой заказ, одна на строку, подарки/возвраты, имя, код,
напоминание), `ReviewServiceTest` (премодерация, публикация сразу, бонус один раз на заказ с owner+expiry,
0% = без бонуса, публикация админом, правка PENDING, лимиты), `ReviewReminderJobTest`,
`ReviewInboxSourceTest`, `PromoPersonalCodeTest` (только владелец, гость, истёкший код).
