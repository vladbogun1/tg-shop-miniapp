/** Ukrainian UI strings. Translated from ru.ts — keep the keys and their order in sync. */
import type { RuDictionary } from "./ru";

export const uk: RuDictionary = {
  // ── common ────────────────────────────────────────────────────────────────
  "common.back": "Назад",
  "common.next": "Далі",
  "common.cancel": "Скасувати",
  "common.close": "Закрити",
  "common.retry": "Повторити",
  "common.loading": "Завантаження…",
  "common.toCatalog": "До каталогу",
  "common.currencyPerItem": "/ шт",

  // ── час ───────────────────────────────────────────────────────────────────
  "time.today": "Сьогодні",
  "time.yesterday": "Вчора",
  "time.justNow": "щойно",
  "time.minutes": "{n} хв",
  "time.hours": "{n} год",

  // ── статуси замовлення ────────────────────────────────────────────────────
  "status.NEW": "Новий",
  "status.APPROVED": "Підтверджений",
  "status.SHIPPED": "Відправлений",
  "status.DELIVERED": "Доставлений",
  "status.REJECTED": "Відхилений",

  // ── нижні вкладки ─────────────────────────────────────────────────────────
  "tabs.shop": "Магазин",
  "tabs.cart": "Кошик",
  "tabs.account": "Акаунт",

  // ── дрібні елементи ───────────────────────────────────────────────────────
  "theme.toggle": "Змінити тему",
  "lang.title": "Мова",
  "lang.switch": "Змінити мову",
  "soon.badge": "Скоро",
  "qty.decrease": "Зменшити",
  "qty.increase": "Збільшити",

  // ── сповіщення ────────────────────────────────────────────────────────────
  "notifications.unread": "Нові повідомлення: {n}",

  // ── чат ───────────────────────────────────────────────────────────────────
  "chat.reply.fallbackSender": "Повідомлення",
  "chat.attachment.photo": "Фото",
  "chat.attachment.file": "Файл",

  // ── картка товару ─────────────────────────────────────────────────────────
  "product.inStock": "В наявності",
  "product.outOfStockShort": "Немає",
  "product.outOfStock": "Немає в наявності",
  "product.choose": "Обрати",

  // ── стрічка статусів замовлення ───────────────────────────────────────────
  "timeline.rejected.title": "Замовлення відхилено",
  "timeline.rejected.text": "Замовлення не було прийнято в обробку",
  "timeline.current": "Поточний статус",

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
  "gallery.prev": "Попереднє фото",
  "gallery.next": "Наступне фото",

  // ── картка товару (докладно) ──────────────────────────────────────────────
  "product.chooseHint": " — оберіть",
  "product.variantOut": " (немає)",
  "product.stockLeft": "В наявності: {n}",

  // ── кроки оформлення ──────────────────────────────────────────────────────
  "checkout.stepCounter": "Крок {current}/{total}",

  // ── промокод ──────────────────────────────────────────────────────────────
  "promo.placeholder": "Промокод",
  "promo.clear": "Прибрати промокод",
  "promo.hint": "Є промокод? Введіть його — знижка порахується одразу.",
  "promo.checking": "Перевіряємо…",
  "promo.notFound": "Промокод не знайдено",
  "promo.discount": "Знижка {discount} з {subtotal}",
  "promo.heldUntil": " · закріплений за вами до {time}",

  // ── каталог ───────────────────────────────────────────────────────────────
  "catalog.tagline": "Обирай і кидай у кошик",
  "catalog.search": "Пошук товарів",
  "catalog.searchClear": "Очистити пошук",
  "catalog.sort": "Сортування",
  "catalog.sort.popular": "Спочатку популярні",
  "catalog.sort.priceAsc": "Спочатку дешевші",
  "catalog.sort.priceDesc": "Спочатку дорожчі",
  "catalog.sort.name": "За назвою (А–Я)",
  "catalog.allTags": "Усі",
  "catalog.error.title": "Не вдалося завантажити",
  "catalog.error.text": "Сервер недоступний. Перевірте підключення і спробуйте ще раз.",
  "catalog.empty.title": "Поки порожньо",
  "catalog.empty.text": "Товарів поки немає. Зазирніть пізніше — скоро з'являться новинки.",
  "catalog.noResults.title": "Нічого не знайдено",
  "catalog.noResults.text": "Спробуйте змінити запит або обрати інший тег.",
  "catalog.resetFilters": "Скинути фільтри",
  "catalog.addedToast": "Додано в кошик",

  // ── кошик ─────────────────────────────────────────────────────────────────
  "cart.title": "Кошик",
  "cart.itemCount": { one: "{n} товар", few: "{n} товари", many: "{n} товарів", other: "{n} товару" },
  "cart.empty.title": "Кошик порожній",
  "cart.empty.text": "Додайте товари з каталогу — і вони з'являться тут.",
  "cart.remove": "Видалити",
  "cart.rowItems": "Товари",
  "cart.rowDiscount": "Знижка",
  "cart.rowDiscountWithCode": "Знижка · {code}",
  "cart.total": "Разом",
  "cart.checkout": "Оформити",

  // ── акаунт ────────────────────────────────────────────────────────────────
  "account.title": "Акаунт",
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
  "payment.paid": "Оплачено",
  "payment.claimed": "На перевірці",
  "payment.unpaid": "Не оплачено",

  // ── чат замовлення ────────────────────────────────────────────────────────
  "chat.online": "В мережі",
  "chat.connecting": "Підключення…",
  "chat.loadEarlier": "Показати давніші",
  "chat.error": "Не вдалося завантажити листування.",
  "chat.empty": "Повідомлень поки немає. Напишіть магазину щодо цього замовлення.",
  "chat.attachmentAlt": "Вкладення",
  "chat.replyTo": "Відповідь · {name}",
  "chat.cancelReply": "Скасувати відповідь",
  "chat.attach": "Прикріпити зображення",
  "chat.placeholder": "Повідомлення…",
  "chat.send": "Надіслати",
  "chat.sendFailed": "Не вдалося надіслати",
  "chat.imagesOnly": "Можна надсилати лише зображення",
  "chat.uploadFailed": "Не вдалося завантажити вкладення",

  // ── замовлення ────────────────────────────────────────────────────────────
  "order.error": "Не вдалося завантажити замовлення.",
  "order.status": "Статус",
  "order.rejectReason": "Причина відхилення",
  "order.tracking": "ТТН",
  "order.createdAt": "Створено {when}",
  "order.items": "Склад",
  "order.gift": "Подарунок · безкоштовно",
  "order.giftMany": "Подарунок × {n} · безкоштовно",
  "order.sum": "Сума",
  "order.discount": "Знижка",
  "order.discountWithCode": "Знижка ({code})",
  "order.total": "Разом",
  "order.recipient": "Отримувач",
  "order.delivery": "Доставка",
  "order.pickup": "Самовивіз",
  "order.payment": "Оплата",
  "order.comment": "Коментар",
  "order.requisites.card": "Картка",
  "order.requisites.edrpou": "РНОКПП",
  "order.requisites.purpose": "Призначення",
  "order.requisites.note": "Примітка",
  "order.paymentConfirmed": "Оплату підтверджено",
  "order.paymentClaimed": "Оплата на перевірці",
  "order.paymentClaimedText": "Скрін отримано. Менеджер перевірить надходження і підтвердить оплату — статус оновиться тут.",
  "order.openChat": "Написати в чат",
  "order.copy": "Скопіювати: {label}",
  "order.proof.title": "Підтвердження переказу",
  "order.proof.text": "Оплатили? Завантажте скріншот переказу — він потрапить у чат замовлення, менеджер перевірить надходження і підтвердить оплату.",
  "order.proof.upload": "Завантажити скрін переказу",
  "order.proof.failed": "Не вдалося надіслати скрін",

  // ── скасування замовлення ─────────────────────────────────────────────────
  "cancel.button": "Скасувати замовлення",
  "cancel.title": "Причина скасування",
  "cancel.reason.payment": "Проблема з оплатою / карткою",
  "cancel.reason.changedMind": "Передумав(ла)",
  "cancel.reason.mistake": "Оформив(ла) помилково",
  "cancel.reason.cheaper": "Знайшов(ла) дешевше",
  "cancel.reason.other": "Інше",
  "cancel.otherPlaceholder": "Опишіть причину",
  "cancel.failed": "Не вдалося скасувати замовлення",
  "order.giftBadge": "🎁 Подарунок",
  "order.npDelivery": "Нова Пошта · {city}",
  "order.requisitesTitle": "Реквізити оплати",

  // ── карта відділень Нової Пошти ───────────────────────────────────────────
  "np.cat.all": "Усі",
  "np.cat.branch": "Відділення",
  "np.cat.postomat": "Поштомати",
  "np.cat.point": "Пункти",
  "np.type.branch": "Відділення",
  "np.type.postomat": "Поштомат",
  "np.type.point": "Пункт",
  "np.hint": "Торкніться відділення на карті",
  "np.confirm": "Обрати це відділення",
  "np.number": "№ {n}",

  // ── оформлення ────────────────────────────────────────────────────────────
  "checkout.title": "Оформлення",
  "checkout.step.contacts": "Контакти",
  "checkout.step.delivery": "Доставка",
  "checkout.step.payment": "Оплата",
  "checkout.step.done": "Готово",
  "checkout.emptyCart": "Кошик порожній.",
  "checkout.submit": "Оформити · {total}",
  "checkout.failed": "Не вдалося оформити замовлення",
  "checkout.promoDropped": "{message}. Промокод прибрано — оформіть замовлення ще раз.",

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
  "checkout.delivery.change": "Змінити відділення",
  "checkout.delivery.required": "Оберіть відділення на карті.",
  "checkout.delivery.pickupText": "Заберіть замовлення з точки магазину — ми зв'яжемося з вами щодо адреси та часу.",
  "checkout.delivery.mapLoading": "Завантаження карти…",
  "checkout.delivery.comment": "Коментар до замовлення (необов'язково)",

  "checkout.payment.error": "Не вдалося завантажити варіанти оплати.",
  "checkout.payment.none": "Варіанти оплати не налаштовані.",
  "checkout.payment.prepay": "Передоплата {amount}",

  "checkout.confirm.items": "Склад",
  "checkout.confirm.sum": "Сума",
  "checkout.confirm.discount": "Знижка",
  "checkout.confirm.discountWithCode": "Знижка · {code}",
  "checkout.confirm.total": "Разом",
  "checkout.confirm.dueNow": "До сплати зараз",
  "checkout.confirm.rest": "Залишок {amount} — при отриманні.",
  "checkout.confirm.promoProblem": "Промокод «{code}»: {message}",
  "checkout.confirm.promoChecking": "перевіряємо…",

  "checkout.success.title": "Замовлення оформлено!",
  "checkout.success.orderNumber": "Номер замовлення",
  "checkout.success.requisites": "Реквізити · {payment}",
  "checkout.success.payByRequisites": "Оплатіть за реквізитами нижче. Підтвердження — у чаті замовлення.",
  "checkout.success.claimed": "Скрін переказу надіслано в чат замовлення. Менеджер перевірить надходження і підтвердить оплату.",
  "checkout.success.payLater": "Можна оплатити пізніше — зі сторінки замовлення",
  "checkout.success.openOrder": "Перейти до замовлення",
};
