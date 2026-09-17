# Дизайн-документ: подарки к заказу, скидка/промокод от админа, сводка склада

Статус: **реализовано локально (ветка `order-gifts-discounts`), в прод не релизим.**
Решения согласованы: скидка = промокод + ручная; менять можно на NEW/APPROVED (предупреждение при оплате); клиента уведомляем тумблером (дефолт вкл.).

## 0. Обзор
Три независимые фичи:
1. **Подарок к заказу** — админ со страницы заказа добавляет товар из каталога как бесплатный подарок; со склада **списывается количество** (чтобы не продали то, что уже подарено).
2. **Скидка/промокод к заказу** — админ применяет промокод или ручную скидку к уже существующему заказу.
3. **Сводка склада** — вверху страницы «Товары» показываем: сколько единиц на складе и на какую сумму.

Общая точка: фичи 1 и 2 меняют состав/итоги существующего заказа со стороны админки, поэтому нужен единый пересчёт итогов + аккуратная работа со стоком и уведомлениями.

---

## 1. Текущая модель (факт, не меняем без нужды)
- `Order`: `subtotalMinor`, `discountMinor`, `totalMinor`, `promoCode`, `prepaymentMinor`, `receivedMinor`, `paid`, `status`, `items[]`.
- `OrderItem`: `productId`, `titleSnapshot`, `priceMinorSnapshot`, `variantId`, `variantNameSnapshot`, `quantity`. **Нет флага «подарок».**
- `PromoCode`: `code`, `discountPercent`, `discountAmountMinor`, `maxUses`, `usesCount`, `active`. Правило скидки: фикс. сумма приоритетнее процента; скидка ≤ subtotal.
- `OrderService.createOrder`: считает `subtotal = Σ price·qty`, применяет промо (`resolvePromo`), **списывает сток** (`variant.stock` и `product.stock`), ставит итоги.
- `restoreStock(order)`: при отмене/отклонении возвращает сток по **всем** позициям (подарки попадут автоматически — трогать не нужно).
- Наложка: `received = paid ? (prepay>0?prepay:total) : 0; cod = max(0, total − received)` (в `OrderQueryService`).
- Админ-эндпоинты заказа: `GET /{id}`, `PATCH /{id}/status`, `PATCH /{id}/paid`, `DELETE /{id}`, чат. **Нет** добавления позиций и применения скидки.

---

## 2. Изменения модели данных
### Миграция V11 — флаг подарка
```sql
ALTER TABLE order_items ADD COLUMN gift BOOLEAN NOT NULL DEFAULT FALSE;
```
- `OrderItem.gift` (`boolean gift = false`). Подарок = `gift=true` + `priceMinorSnapshot=0`.
- Фича 2 (скидка) использует существующие `discountMinor`/`promoCode` — **схему не меняет**.

### Единый пересчёт итогов (новый приватный метод в OrderService)
```java
private void recomputeTotals(Order o) {
    long subtotal = o.getItems().stream()
        .mapToLong(i -> i.getPriceMinorSnapshot() * (long) i.getQuantity()).sum();
    o.setSubtotalMinor(subtotal);
    long discount = Math.min(Math.max(0, o.getDiscountMinor()), subtotal); // храним абсолют, кэпим
    o.setDiscountMinor(discount);
    o.setTotalMinor(Math.max(0, subtotal - discount));
}
```
- `discountMinor` храним **абсолютной суммой** (снимок на момент применения). При добавлении подарка subtotal не меняется (цена 0) → итог не двигается. При применении скидки — задаём `discountMinor` явно и зовём пересчёт.

### Выделить хелпер списания стока (рефактор из createOrder)
```java
private void reserveStock(Product p, ProductVariant v, int qty) { /* проверка + декремент product/variant, как в createOrder */ }
```
Переиспользуем и в `createOrder`, и в добавлении подарка. `restoreStock` уже общий.

---

## 3. Фича 1 — Подарок к заказу

### Правила (бизнес-логика)
- Подарок можно добавлять, пока заказ **NEW или APPROVED** (до отправки). На SHIPPED/DELIVERED/REJECTED — нельзя (можно расширить на SHIPPED позже, по желанию).
- Товар должен быть в наличии; если у товара есть варианты — вариант обязателен. Кол-во ≥ 1.
- Списываем сток так же, как при покупке (`reserveStock`) → единица «занята», её не купят.
- Позиция-подарок: `priceMinorSnapshot = 0`, `gift = true`. В subtotal даёт 0 → **итог и наложка не меняются**.
- Если тот же товар+вариант уже добавлен подарком — **увеличиваем qty существующей** подарочной позиции (без дублей).
- Удаление подарка админом → `restoreStock` для этой позиции + удаление + пересчёт.
- Отмена/отклонение заказа: `restoreStock` вернёт и подарочные единицы автоматически (уже работает).

### API
- `POST /api/admin/orders/{id}/gift` — тело `{ productId, variantId?, quantity }` → добавляет/увеличивает подарок, возвращает `OrderDetailDto`.
- `DELETE /api/admin/orders/{id}/items/{itemId}` — удаляет позицию (в MVP — только `gift=true`), восстанавливает сток, пересчёт.

### Сервис
`OrderService.addGift(orderId, productId, variantId, qty)`:
1. `get(order)`, гард статуса (NEW/APPROVED).
2. Загрузить product (не archived), вариант (если у товара есть варианты — обязателен).
3. `reserveStock(product, variant, qty)` (проверка наличия + декремент).
4. Найти существующую подарочную позицию по product+variant → `qty += n`, иначе создать `OrderItem(gift=true, price=0, snapshots)`.
5. `recomputeTotals(order)` (итог не изменится, но держим консистентно).
6. `save` + уведомления (см. §5).

`OrderService.removeItem(orderId, itemId)`: `restoreStock` по позиции → удалить → `recomputeTotals` → save + refresh dispatch.

### DTO
- `OrderItemDto` (+ `boolean gift`) — и в админ- и в клиентском API (клиент увидит «🎁 Подарок · 0 ₴»).
- Отдельный `GiftRequest { String productId; String variantId; int quantity; }`.

### UI (админка, `OrderDrawer`, вкладка «Детали»)
- Кнопка **«🎁 Добавить подарок»** → мини-пикер: поиск товара (тот же `adminApi.products()`), выбор варианта (если есть), количество → «Добавить».
- В списке позиций подарок помечен бейджем **«🎁 Подарок»** и ценой «0 ₴», рядом «×» (удалить).
- Клиент в своём заказе видит подарок с пометкой 🎁 (приятный сюрприз).
- Карточка «Отправка» (dispatch) и так перечисляет все позиции — помечаем строки подарков 🎁, чтобы продавец не забыл вложить.

### Edge-cases / решения
- Нет стока → `400 «нет в наличии»`.
- Подарок не влияет на оплату/наложку (цена 0).
- Товар неактивный (скрыт) — **разрешаем** дарить, если есть сток (на усмотрение админа), archived — запрещаем.

---

## 4. Фича 2 — Скидка / промокод к заказу

### Правила
- Применение скидки, пока заказ **NEW/APPROVED**. Если по заказу уже что-то получено (`received>0`) — показываем предупреждение (скидка ниже полученной суммы = переплата/возврат; расчётов возврата не делаем, только показываем).
- Два способа в одном модальном окне:
  - **Промокод** — выбрать из списка активных промокодов или ввести код. Валидируется `resolvePromo` (active, `maxUses`). Скидка считается на **текущий subtotal** (фикс приоритетнее %). `usesCount++`; при замене/снятии предыдущего промо — `usesCount--` у старого.
  - **Ручная скидка** — сумма (₴) или процент от subtotal, без реального кода (`promoCode=null`, метка «Ручная скидка»). Покрывает «просто сделать скидку кому-то».
- Скидка кэпится ≤ subtotal. `total = subtotal − discount`.
- Снятие скидки → `discountMinor=0`, `promoCode=null`, пересчёт, `usesCount--` если был реальный код.

### API
- `POST /api/admin/orders/{id}/discount` — тело (один из):
  - `{ promoCode: "SALE10" }`
  - `{ amountMinor: 5000 }` (ручная фикс. скидка)
  - `{ percent: 10 }` (ручная процентная)
  - `{ clear: true }` (снять)
  → возвращает `OrderDetailDto`.

### Сервис
`OrderService.applyDiscount(orderId, req)`:
1. `get(order)`, гард статуса.
2. Вычислить `discount`:
   - promoCode → `resolvePromo` (валидация) → фикс/процент от subtotal; выставить `order.promoCode`, счётчики usesCount (учесть замену).
   - amountMinor/percent → ручная; `order.promoCode=null`.
   - clear → 0.
3. `order.setDiscountMinor(min(discount, subtotal))`, `recomputeTotals`.
4. `save` + уведомления (опц. DM клиенту «вам применена скидка …»).

### DTO
- `ApplyDiscountRequest { String promoCode; Long amountMinor; Integer percent; Boolean clear; }`.
- `OrderDetailDto` уже содержит `subtotalMinor/discountMinor/promoCode/totalMinor` — на клиенте/в админке просто отрисовать блок скидки.

### UI (админка, `OrderDrawer`)
- Кнопка **«% Скидка»** → модалка с переключателем «Промокод / Ручная», превью нового «Итого», «Применить». Текущая скидка видна в денежном блоке (Сумма товаров → −Скидка (промо/метка) → Итого), рядом «убрать».

### Edge-cases
- `received>0` → предупреждение в модалке (переплата).
- Промокод неактивен/исчерпан → `400`.
- Скидка > subtotal → кэп до subtotal (итог 0).

---

## 5. Общее: уведомления и карточки
- После добавления подарка / применения скидки: обновить админ-карточку статуса и **карточку отправки** (наложка/состав), т.к. состав/итоги изменились.
- Клиенту — **опциональный DM** (тумблер в модалке, дефолт: подарок = уведомить (сюрприз), скидка = уведомить). Текст: «🎁 Вам добавлен подарок к заказу #… : …» / «Вам применена скидка … на заказ #…».
- Механику переиспользуем из существующего `NotificationService` (onStatusChanged / postDispatchCard / notifyCustomerStatus).

---

## 6. Фича 3 — Сводка склада на странице «Товары»

### Правила
- Вверху страницы (под `PageHeader`) — компактная строка-сводка по **активным не-archived** товарам:
  - **Товаров**: количество.
  - **Единиц на складе**: `Σ effStock(p)` (effStock = сумма стоков вариантов, иначе `product.stock`).
  - **Стоимость склада**: `Σ effStock(p) · priceMinor(p)` → в ₴.
  - (опц.) **Закончились**: сколько активных с 0.

### Реализация
- **Клиентский расчёт** (MVP): страница уже грузит все товары со `stock/priceMinor/variants` → считаем на фронте (`useMemo`), мгновенно, без бэкенда. `effStock` уже есть в компоненте.
- (Опционально позже) бэкенд-агрегат `GET /api/admin/products/stats` — если появится пагинация. Пока не нужен.

### UI
- Ряд из 3–4 «stat-плиток» в нео-стиле (как на «Метриках»): «Товаров N», «На складе U ед.», «Стоимость X ₴», «Закончились K».

---

## 7. Список файлов на изменение
**Backend**
- `db/migration/V11__order_item_gift.sql` (new)
- `domain/OrderItem.java` (+gift)
- `service/OrderService.java` (+addGift, removeItem, applyDiscount, recomputeTotals, reserveStock рефактор)
- `service/OrderQueryService.java` (gift в toDetail items; наложка не меняется)
- `web/controller/AdminOrderController.java` (+POST /gift, DELETE /items/{itemId}, POST /discount)
- `web/dto/`: GiftRequest, ApplyDiscountRequest (new); OrderItemDto (+gift)
- `tg/NotificationService.java` (пометка 🎁 в dispatch; тексты DM)

**Админка (`frontend-admin`)**
- `lib/api.ts` (+addGift, removeOrderItem, applyOrderDiscount; gift в OrderItemDto)
- `components/orders/OrderDrawer.tsx` (кнопки/бейджи, денежный блок со скидкой)
- `components/orders/GiftPicker.tsx` (new), `DiscountModal.tsx` (new)
- `app/products/page.tsx` (строка-сводка склада)

**Клиент (`frontend`)**
- `lib/api.ts` (gift в OrderItemDto)
- `app/account/orders/[id]/page.tsx` (пометка 🎁 у подарка)

---

## 8. План внедрения и проверка (локально)
1. Backend: миграция + модель + сервис (addGift/removeItem/applyDiscount/recompute) + контроллер + DTO.
2. e2e (python, как раньше): создать заказ → добавить подарок (сток −1, итог тот же, позиция gift) → применить промокод/ручную скидку (итог − скидка, наложка пересчиталась) → снять скидку → удалить подарок (сток вернулся) → отмена заказа (сток всех позиций вернулся).
3. Админ-UI: пикер подарка, модалка скидки, денежный блок, бейджи.
4. Страница товаров: сводка склада.
5. Клиент: пометка подарка.
Всё — локально; деплой/тег — только по отдельной команде.

---

## 9. Решения по умолчанию (можно поменять)
1. Скидку/подарок разрешаем на **NEW/APPROVED**; на paid/received>0 — со скидкой предупреждаем.
2. Скидка: поддерживаем **и промокод, и ручную** сумму/процент.
3. Клиента об изменениях **уведомляем** (тумблер, дефолт вкл.).
4. Сводка склада — по **активным не-archived**, расчёт на фронте.
5. Дубли подарков **сливаем** по товар+вариант (увеличиваем qty).
