/** Ukrainian UI strings. Translated from ru.ts — keep the keys and their order in sync. */
import { sharedUk } from "@shop/customer/i18n/shared-uk";
import type { RuDictionary } from "./ru";

export const uk: RuDictionary = {
  ...sharedUk,
  // ── common ────────────────────────────────────────────────────────────────
  "common.next": "Далі",
  "common.sessionExpiredApp": "Сесія завершилася, відкрийте магазин знову",
  "common.currencyPerItem": "/ шт",

  // ── час ───────────────────────────────────────────────────────────────────

  // ── статуси замовлення ────────────────────────────────────────────────────

  // ── нижні вкладки ─────────────────────────────────────────────────────────
  "tabs.shop": "Магазин",
  "tabs.cart": "Кошик",
  "tabs.account": "Акаунт",

  // ── дрібні елементи ───────────────────────────────────────────────────────
  "lang.title": "Мова",
  "lang.switch": "Змінити мову",

  // ── сповіщення ────────────────────────────────────────────────────────────
  "notifications.unread": "Нові повідомлення: {n}",

  // ── чат ───────────────────────────────────────────────────────────────────

  // ── картка товару ─────────────────────────────────────────────────────────
  "product.outOfStockShort": "Немає",
  "product.variantLabel": "Варіант",
  "addToCart.add": "У кошик",

  // ── стрічка статусів замовлення ───────────────────────────────────────────

  // ── список листувань ──────────────────────────────────────────────────────
  "inbox.title": "Повідомлення",
  "inbox.empty": "Немає нових повідомлень",
  "inbox.youPrefix": "Ви: ",
  "inbox.orderNumber": "Замовлення {id}",
  "inbox.noPreview": "—",

  // ── додавання в кошик ─────────────────────────────────────────────────────
  "addToCart.chooseVariant": "Оберіть варіант",
  "addToCart.remove": "Прибрати з кошика",

  // ── галерея ───────────────────────────────────────────────────────────────
  "gallery.photoAlt": "{alt} — фото {n}",
  "gallery.photoLabel": "Фото {n}",

  // ── картка товару (докладно) ──────────────────────────────────────────────
  "product.chooseHint": " — оберіть",
  "product.variantOutSuffix": " (немає)",
  "product.stockLeft": "В наявності: {n}",

  // ── кроки оформлення ──────────────────────────────────────────────────────
  "checkout.stepCounter": "Крок {current}/{total}",

  // ── промокод ──────────────────────────────────────────────────────────────

  // ── каталог ───────────────────────────────────────────────────────────────
  "catalog.tagline": "Обирай і кидай у кошик",
  "catalog.search": "Пошук товарів",
  "catalog.searchClear": "Очистити пошук",
  "catalog.sort.popular": "Спочатку популярні",
  "catalog.sort.priceAsc": "Спочатку дешевші",
  "catalog.sort.priceDesc": "Спочатку дорожчі",
  "catalog.allTags": "Усі",
  "catalog.error.title": "Не вдалося завантажити",
  "catalog.error.text": "Сервер недоступний. Перевірте підключення і спробуйте ще раз.",
  "catalog.empty.titleApp": "Поки порожньо",
  "catalog.empty.textApp": "Товарів поки немає. Зазирніть пізніше — скоро з'являться новинки.",
  "catalog.noResults.title": "Нічого не знайдено",
  "catalog.noResults.text": "Спробуйте змінити запит, категорію або фільтри.",
  "catalog.resetFilters": "Скинути фільтри",
  "catalog.addedToast": "Додано в кошик",
  // каталог v2: категорії, фільтри, характеристики
  "catalog.markdown": "Уцінка",
  "catalog.cond.markdown": "Уцінка",
  "catalog.cond.used": "Вживане",
  "catalog.filter.show": { one: "Показати {n} товар", few: "Показати {n} товари", many: "Показати {n} товарів", other: "Показати {n} товару" },
  "catalog.filter.showNone": "Немає відповідних товарів",
  "catalog.filter.reset": "Скинути",
  "catalog.filter.resetAll": "Скинути все",
  "catalog.filter.brand": "Бренд",
  "catalog.filter.price": "Ціна, ₴",
  "catalog.filter.from": "від",
  "catalog.filter.to": "до",
  "catalog.filter.inStock": "Лише в наявності",
  "catalog.filter.condition": "Стан",
  "catalog.filter.specs": "Характеристики",
  "catalog.filter.chooseCategory": "Оберіть категорію, щоб фільтрувати за характеристиками",
  "catalog.filter.remove": "Прибрати фільтр «{name}»",
  "catalog.filter.rangeFrom": "від {n}",
  "catalog.filter.rangeTo": "до {n}",
  "product.allProducts": "Усі товари",
  "product.specs.title": "Характеристики",
  "product.specs.all": "Усі характеристики",
  "product.specs.collapse": "Згорнути",

  // ── кошик ─────────────────────────────────────────────────────────────────
  "cart.itemCount": { one: "{n} товар", few: "{n} товари", many: "{n} товарів", other: "{n} товару" },
  "cart.rowItems": "Товари",
  "cart.rowDiscount": "Знижка",
  "cart.rowDiscountWithCode": "Знижка · {code}",

  // ── акаунт ────────────────────────────────────────────────────────────────
  "account.titleApp": "Акаунт",
  "account.subtitle": "Профіль та історія замовлень",
  "account.guest": "Гість",
  "account.ordersBadge": { one: "{n} зам.", few: "{n} зам.", many: "{n} зам.", other: "{n} зам." },
  "account.myOrders": "Мої замовлення",
  "account.error.title": "Не вдалося завантажити",
  "account.error.text": "Увійдіть через Telegram або перевірте підключення.",
  "account.empty.title": "Замовлень поки немає",
  "account.empty.text": "Оформіть перше замовлення — воно з'явиться тут.",
  "account.itemsCount": { one: "{n} тов.", few: "{n} тов.", many: "{n} тов.", other: "{n} тов." },

  // ── оплата ────────────────────────────────────────────────────────────────

  // ── чат замовлення ────────────────────────────────────────────────────────
  "chat.replyTo": "Відповідь · {name}",
  "chat.cancelReply": "Скасувати відповідь",
  "chat.placeholderApp": "Повідомлення…",

  // ── підтримка (питання не щодо замовлення) ───────────────────────────────
  "support.entry": "Підтримка",
  "support.entryHint": "Питання про товари, доставку й оплату",
  "support.subtitle": "Ваші питання магазину",
  "support.error": "Не вдалося завантажити звернення.",
  "support.status.OPEN": "Відкрите",
  "support.status.CLOSED": "Закрите",
  "support.newTitle": "Нове питання",
  "support.newHint": "Напишіть питання — магазин відповість тут, а бот надішле сповіщення.",
  "support.aboutProduct": "Питання про товар",
  "support.closed": "Звернення закрите. Напишіть — і воно відкриється знову.",
  "support.waiting": "Чекаємо на відповідь магазину",
  "support.chars": "{n} / {max}",

  // ── замовлення ────────────────────────────────────────────────────────────
  "order.recipient": "Отримувач",
  "order.openChat": "Написати в чат",
  "order.copy": "Скопіювати: {label}",

  // ── скасування замовлення ─────────────────────────────────────────────────
  "order.npDelivery": "Нова Пошта · {city}",

  // ── online payment (monobank) on the order page ──────────────────────────
  "pay.title": "Оплата",
  "pay.hint": "Оплата відкриється в браузері: Google Pay, Apple Pay, картка або monobank. Після оплати повернетеся сюди.",
  "pay.prepayment": "Передоплата онлайн, решта {amount} — при отриманні.",
  "pay.hm": "{h} год {m} хв",
  "pay.m": "{m} хв",
  "pay.timeUp": "Час на оплату минув",
  "pay.failedGeneric": "Оплата не пройшла. Спробуйте ще раз або іншою карткою.",
  "pay.retry": "Спробувати ще раз · {amount}",
  "pay.method.cardLast4": "Картка •• {last4}",
  "pay.method.apple": "Apple Pay",
  "pay.method.google": "Google Pay",
  "pay.method.monobank": "monobank",
  "pay.willConfirm": "Ми перевіримо наявність і підтвердимо замовлення.",
  "pay.openFallback": "Оплата не відкрилася? Відкрити в Telegram",

  // ── карта відділень Нової Пошти ───────────────────────────────────────────
  "np.confirm": "Обрати це відділення",

  // ── оформлення ────────────────────────────────────────────────────────────
  "checkout.step.contacts": "Контакти",
  "checkout.step.delivery": "Доставка",
  "checkout.step.payment": "Оплата",
  "checkout.step.done": "Готово",
  "checkout.redirecting": "Відкриваємо оплату…",

  "checkout.contacts.intro": "Куди і кому доставити замовлення — почнімо з контактів.",
  "checkout.contacts.name": "Ім'я та прізвище",
  "checkout.contacts.nameError": "Вкажіть ім'я",
  "checkout.contacts.phone": "Телефон",
  "checkout.contacts.phoneError": "Введіть номер: +38 (0XX) XXX-XX-XX",

  "checkout.delivery.np": "Нова Пошта",
  "checkout.delivery.npSubtitle": "Відділення / поштомат",
  "checkout.delivery.pickup": "Самовивіз",
  "checkout.delivery.pickupSubtitle": "З точки магазину",
  "checkout.delivery.mapHint": "Знайдіть відділення на карті та натисніть «Обрати».",
  "checkout.delivery.required": "Оберіть відділення — у списку або на карті.",
  "checkout.delivery.pickupText": "Заберіть замовлення з точки магазину — ми зв'яжемося з вами щодо адреси та часу.",
  "checkout.delivery.mapLoading": "Завантаження карти…",
  "checkout.delivery.comment": "Коментар до замовлення (необов'язково)",
  "checkout.np.modeText": "Ввести вручну",
  "checkout.np.modeMap": "Обрати на карті",
  "checkout.np.city": "Місто",
  "checkout.np.cityPlaceholder": "Почніть вводити назву",
  "checkout.np.cityNone": "Місто не знайдено",
  "checkout.np.warehouse": "Відділення / поштомат",
  "checkout.np.warehousePlaceholder": "Номер або адреса",
  "checkout.np.warehouseNone": "У цьому місті такого відділення немає",
  "checkout.np.lastWarehouse": "Як у попередньому замовленні",
  "checkout.np.changeLast": "Обрати інше",

  "checkout.payment.error": "Не вдалося завантажити варіанти оплати.",
  "checkout.payment.none": "Варіанти оплати не налаштовані.",
  "checkout.payment.full": "Уся сума онлайн: картка, Apple Pay або Google Pay",
  "checkout.payment.prepayOnline": "{amount} онлайн зараз, решта — готівкою при отриманні",
  "checkout.payment.trust": "Оплата через monobank — дані картки магазин не бачить",
  "checkout.payment.deadline": "Оплатіть протягом 24 годин, інакше замовлення скасується автоматично.",

  "checkout.confirm.items": "Склад",
  "checkout.confirm.sum": "Сума",
  "checkout.confirm.discount": "Знижка",
  "checkout.confirm.discountWithCode": "Знижка · {code}",
  "checkout.confirm.total": "Разом",
  "checkout.confirm.dueNow": "До сплати зараз",
  "checkout.confirm.rest": "Залишок {amount} — при отриманні.",
  "checkout.confirm.promoProblem": "Промокод «{code}»: {message}",
  "checkout.confirm.promoChecking": "перевіряємо…",

  // ── відгуки та бонус за відгук (Phase C) ─────────────────────────────────
  "reviews.starsAria": "Оцінка {value} з 5",
  "reviews.ratingAria": { one: "Рейтинг {value} з 5, {n} відгук", few: "Рейтинг {value} з 5, {n} відгуки", many: "Рейтинг {value} з 5, {n} відгуків", other: "Рейтинг {value} з 5, {n} відгуку" },
  "reviews.distAria": "{star}★: {n}",
  "reviews.loadError": "Не вдалося завантажити відгуки.",
  "reviews.showMore": "Показати ще",
  "reviews.anonymous": "Покупець",
  "reviews.variant": "Варіант: {name}",
  "reviews.form.ratingLabel": "Оцінка",
  "reviews.form.starN": "{n} з 5",
  "reviews.form.textLabel": "Текст відгуку",
  "reviews.form.pickStars": "Поставте оцінку",
  "reviews.deliveredAt": "доставлено {date}",
  "reviews.thanks": "Дякуємо за відгук!",
  "reviews.thanksModeration": "Відгук з'явиться після перевірки модератором.",
  "reviews.thanksPublished": "Відгук опубліковано.",
  "reviews.bonus.copy": "Скопіювати код {code}",
  "reviews.bonus.copied": "Скопійовано",
  "reviews.bonus.howTo": "У кошику над полем «Промокод» з’явиться кнопка «Застосувати». Код одноразовий і діє лише для вас.",
  "reviews.order.title": "Залиште відгук — отримайте знижку на наступне замовлення",
  "reviews.order.text": "За перший опублікований відгук на замовлення — особистий промокод на наступну покупку.",
  "reviews.account.title": "Відгуки",
  "reviews.account.subtitle": "Ваші відгуки та бонуси",
  "reviews.account.waiting": { one: "{n} товар чекає на відгук", few: "{n} товари чекають на відгук", many: "{n} товарів чекають на відгук", other: "{n} товару чекають на відгук" },
  "reviews.account.error": "Не вдалося завантажити відгуки.",
  "reviews.account.empty.title": "Поки порожньо",
  "reviews.account.empty.text": "Коли замовлення доставлять, тут можна буде залишити відгук і отримати бонус.",
  "reviews.account.toOrders": "До замовлень",
  "reviews.account.pending": "Чекають на відгук",
  "reviews.account.mine": "Мої відгуки",
  "reviews.account.bonuses": "Мої бонуси",

  // ── payment return page (opened in a browser, outside Telegram) ──────────
  "payReturn.title": "Дякуємо! Оплату прийнято в обробку",
  "payReturn.text": "Зараз повернемо вас у магазин у Telegram — статус оплати оновиться сам, а бот надішле повідомлення.",
  "payReturn.order": "Замовлення {id}",
  "payReturn.back": "Повернутися в магазин",
  "payReturn.closeHint": "Не перекинуло? Натисніть «Повернутися в магазин» або просто закрийте браузер.",
  "payReturn.embedded": "Оплату прийнято в обробку…",
  "payReturn.embeddedText": "Повертаємося до замовлення",
  // ---- comparison ----
  "compare.tab": "Порівняти",
  // ---- gift for the order sum / gift case (docs/GIFT-CASE.md) ----
  "case.giftLeft": "До подарунка ще {amount}",
  "case.giftReached": "Подарунок: {title} — додамо до замовлення безкоштовно",
  "case.giftLine": "🎁 Подарунок за суму",
  // ---- preorders ----
  "preorder.badge.held": "Бронь",
  "preorder.eta.ordered": "замовлено",
  "preorder.eta.transit": "їде",
  "preorder.eta.card": "{stage} · {d}",
  "preorder.eta.weeks": "~{n} тиж.",
  "preorder.eta.soon": "найближчим часом",
  "preorder.card.queued": "Ви в черзі",
  "preorder.variant.coming": " · їде",
  "preorder.variant.held": " · бронь",
  "preorder.block.title": "Їде до нас",
  "preorder.block.titleOut": "Немає в наявності",
  "preorder.expect": "Очікуємо: {d}",
  "preorder.outHint": "Повідомимо в Telegram, щойно товар з'явиться.",
  "preorder.cta.notify": "Повідомити, коли приїде",
  "preorder.cta.notifyOut": "Повідомити, коли з'явиться",
  "preorder.cta.queued": "Ви в черзі",
  "preorder.queued.line": "Ви в черзі · №{pos} · {n} шт",
  "preorder.queued.lineNoPos": "Ви в черзі · {n} шт",
  "preorder.queued.change": "Змінити",
  "preorder.leave": "Вийти з черги",
  "preorder.sheet.botText": "Напишемо вам у Telegram-боті, коли товар приїде, і забронюємо на {h} год.",
  "preorder.sheet.botOut": "Напишемо вам у Telegram-боті, коли товар з'явиться.",
  "preorder.sheet.join": "Стати в чергу",
  "preorder.sheet.save": "Зберегти",
  "preorder.sheet.max": "Максимум {n} шт",
  "preorder.toast.joined": "Ви в черзі",
  "preorder.toast.left": "Ви вийшли з черги",
  "preorder.err.inStock": "Товар уже в наявності — його можна купити.",
  "preorder.err.generic": "Не вдалося стати в чергу. Спробуйте ще раз.",
  "preorder.held.title": "Заброньовано за вами до {t}",
  "preorder.held.left": "Можна купити: {n} шт",
  "preorder.ribbon.title": "Скоро в наявності",
  "preorder.ribbon.all": "Усі",
  "preorder.account.subtitle": "Черги та броні на товари",
  "preorder.account.heldCount": { one: "{n} бронь чекає на покупку", few: "{n} броні чекають на покупку", many: "{n} броней чекають на покупку", other: "{n} броні чекають на покупку" },
  "preorder.status.waiting": "Чекаємо",
  "preorder.status.waitingPos": "Чекаємо · №{pos}",
  "preorder.status.held": "Заброньовано до {t}",
  "preorder.status.bought": "Куплено",
  "preorder.status.expired": "Бронь минула — стати знову",
  "preorder.status.cancelled": "Вийшов",
  "preorder.row.buy": "Купити",
  "preorder.row.again": "Стати знову",
  "preorder.row.qty": "{n} шт",
  "preorder.filter": "Передзамовлення",
};
