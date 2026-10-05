/**
 * Russian — the source dictionary.
 *
 * This is the one people edit by hand; `uk.ts` and `en.ts` are translated from it and must have
 * exactly the same keys (TypeScript enforces that). When you add a phrase, add it here first.
 *
 * Conventions:
 *  - keys are dotted and grouped by screen: `cart.*`, `checkout.*`, `chat.*`;
 *  - `common.*` is for words reused across screens — do not put a screen-specific phrase there
 *    just because it happens to be short;
 *  - `{placeholders}` are filled at call time; a phrase with several forms is an object and picks
 *    its form from `n`.
 */
import type { Dictionary, PluralPhrase } from "./types";

export const ru = {
  // ── common ────────────────────────────────────────────────────────────────
  "common.back": "Назад",
  "common.next": "Далее",
  "common.cancel": "Отмена",
  "common.close": "Закрыть",
  "common.retry": "Повторить",
  "common.loading": "Загрузка…",
  "common.toCatalog": "В каталог",
  "common.offline": "Не удалось связаться с сервером",
  "common.sessionExpired": "Сессия истекла, откройте магазин заново",
  "common.httpError": "Ошибка {status}",
  "error.title": "Что-то пошло не так",
  "error.text": "Приложение споткнулось. Попробуйте ещё раз — если не поможет, закройте и откройте магазин заново.",
  "common.currencyPerItem": "/ шт",

  // ── время ─────────────────────────────────────────────────────────────────
  "time.today": "Сегодня",
  "time.yesterday": "Вчера",
  "time.justNow": "только что",
  "time.minutes": "{n} мин",
  "time.hours": "{n} ч",

  // ── статусы заказа ────────────────────────────────────────────────────────
  "status.NEW": "Новый",
  "status.APPROVED": "Одобрен",
  "status.SHIPPED": "Отправлен",
  "status.DELIVERED": "Доставлен",
  "status.REJECTED": "Отклонён",

  // ── нижние вкладки ────────────────────────────────────────────────────────
  "tabs.shop": "Магазин",
  "tabs.cart": "Корзина",
  "tabs.account": "Аккаунт",

  // ── мелкие элементы ───────────────────────────────────────────────────────
  "theme.toggle": "Сменить тему",
  "lang.title": "Язык",
  "lang.switch": "Сменить язык",
  "soon.badge": "Скоро",
  "qty.decrease": "Уменьшить",
  "qty.increase": "Увеличить",

  // ── уведомления ───────────────────────────────────────────────────────────
  "notifications.unread": "Новые сообщения: {n}",

  // ── чат ───────────────────────────────────────────────────────────────────
  "chat.reply.fallbackSender": "Сообщение",
  "chat.attachment.photo": "Фото",
  "chat.attachment.file": "Файл",

  // ── карточка товара ───────────────────────────────────────────────────────
  "product.inStock": "В наличии",
  "product.outOfStockShort": "Нет",
  "product.outOfStock": "Нет в наличии",
  "product.choose": "Выбрать",
  "product.variantLabel": "Вариант",
  "product.noDescription": "Описание отсутствует",
  "addToCart.add": "В корзину",

  // ── лента статусов заказа ─────────────────────────────────────────────────
  "timeline.rejected.title": "Заказ отклонён",
  "timeline.rejected.text": "Заказ не был принят в обработку",
  "timeline.current": "Текущий статус",

  // ── список переписок ──────────────────────────────────────────────────────
  "inbox.title": "Сообщения",
  "inbox.empty": "Нет новых сообщений",
  "inbox.youPrefix": "Вы: ",
  "inbox.orderNumber": "Заказ {id}",
  "inbox.noPreview": "—",

  // ── добавление в корзину ──────────────────────────────────────────────────
  "addToCart.chooseVariant": "Выберите вариант",
  "addToCart.remove": "Убрать из корзины",

  // ── галерея ───────────────────────────────────────────────────────────────
  "gallery.photoAlt": "{alt} — фото {n}",
  "gallery.photoLabel": "Фото {n}",
  "gallery.prev": "Предыдущее фото",
  "gallery.next": "Следующее фото",

  // ── карточка товара (подробно) ────────────────────────────────────────────
  "product.chooseHint": " — выберите",
  "product.variantOut": " (нет)",
  "product.stockLeft": "В наличии: {n}",

  // ── шаги оформления ───────────────────────────────────────────────────────
  "checkout.stepCounter": "Шаг {current}/{total}",

  // ── промокод ──────────────────────────────────────────────────────────────
  "promo.placeholder": "Промокод",
  "promo.clear": "Убрать промокод",
  "promo.hint": "Есть промокод? Введите его — скидка посчитается сразу.",
  "promo.checking": "Проверяем…",
  "promo.notFound": "Промокод не найден",
  "promo.discount": "Скидка {discount} из {subtotal}",
  "promo.heldUntil": " · закреплён за вами до {time}",

  // ── каталог ───────────────────────────────────────────────────────────────
  "catalog.tagline": "Выбирай и кидай в корзину",
  "catalog.search": "Поиск товаров",
  "catalog.searchClear": "Очистить поиск",
  "catalog.sort": "Сортировка",
  "catalog.sort.popular": "Сначала популярные",
  "catalog.sort.priceAsc": "Сначала дешевле",
  "catalog.sort.priceDesc": "Сначала дороже",
  "catalog.sort.name": "По названию (А–Я)",
  "catalog.allTags": "Все",
  "catalog.error.title": "Не удалось загрузить",
  "catalog.error.text": "Сервер недоступен. Проверьте подключение и попробуйте снова.",
  "catalog.empty.title": "Пока пусто",
  "catalog.empty.text": "Товаров пока нет. Загляните позже — скоро появятся новинки.",
  "catalog.noResults.title": "Ничего не найдено",
  "catalog.noResults.text": "Попробуйте изменить запрос или выбрать другой тег.",
  "catalog.resetFilters": "Сбросить фильтры",
  "catalog.addedToast": "Добавлено в корзину",

  // ── корзина ───────────────────────────────────────────────────────────────
  "cart.title": "Корзина",
  "cart.itemCount": { one: "{n} товар", few: "{n} товара", many: "{n} товаров", other: "{n} товара" },
  "cart.empty.title": "Корзина пуста",
  "cart.empty.text": "Добавьте товары из каталога — и они появятся здесь.",
  "cart.remove": "Удалить",
  "cart.rowItems": "Товары",
  "cart.rowDiscount": "Скидка",
  "cart.rowDiscountWithCode": "Скидка · {code}",
  "cart.total": "Итого",
  "cart.checkout": "Оформить",

  // ── аккаунт ───────────────────────────────────────────────────────────────
  "account.title": "Аккаунт",
  "account.subtitle": "Профиль и история заказов",
  "account.guest": "Гость",
  "account.ordersBadge": { one: "{n} зак.", few: "{n} зак.", many: "{n} зак.", other: "{n} зак." },
  "account.myOrders": "Мои заказы",
  "account.error.title": "Не удалось загрузить",
  "account.error.text": "Войдите через Telegram или проверьте подключение.",
  "account.empty.title": "Заказов пока нет",
  "account.empty.text": "Оформите первый заказ — он появится здесь.",
  "account.itemsCount": { one: "{n} тов.", few: "{n} тов.", many: "{n} тов.", other: "{n} тов." },

  // ── оплата ────────────────────────────────────────────────────────────────
  "payment.paid": "Оплачен",
  "payment.awaiting": "Ждёт оплаты",
  "payment.partial": "Частично оплачен",
  "payment.unpaid": "Не оплачен",

  // ── чат заказа ────────────────────────────────────────────────────────────
  "chat.online": "В сети",
  "chat.connecting": "Подключение…",
  "chat.loadEarlier": "Показать более ранние",
  "chat.error": "Не удалось загрузить переписку.",
  "chat.empty": "Сообщений пока нет. Напишите магазину по этому заказу.",
  "chat.attachmentAlt": "Вложение",
  "chat.replyTo": "Ответ · {name}",
  "chat.cancelReply": "Отменить ответ",
  "chat.attach": "Прикрепить изображение",
  "chat.placeholder": "Сообщение…",
  "chat.send": "Отправить",
  "chat.sendFailed": "Не удалось отправить",
  "chat.imagesOnly": "Можно отправлять только изображения",
  "chat.uploadFailed": "Не удалось загрузить вложение",

  // ── заказ ─────────────────────────────────────────────────────────────────
  "order.error": "Не удалось загрузить заказ.",
  "order.status": "Статус",
  "order.rejectReason": "Причина отклонения",
  "order.tracking": "ТТН",
  "order.createdAt": "Создан {when}",
  "order.items": "Состав",
  "order.gift": "Подарок · бесплатно",
  "order.giftMany": "Подарок × {n} · бесплатно",
  "order.sum": "Сумма",
  "order.discount": "Скидка",
  "order.discountWithCode": "Скидка ({code})",
  "order.total": "Итого",
  "order.recipient": "Получатель",
  "order.delivery": "Доставка",
  "order.pickup": "Самовывоз",
  "order.payment": "Оплата",
  "order.comment": "Комментарий",
  "order.openChat": "Написать в чат",
  "order.copy": "Скопировать: {label}",

  // ── отмена заказа ─────────────────────────────────────────────────────────
  "cancel.button": "Отменить заказ",
  "cancel.title": "Причина отмены",
  "cancel.reason.payment": "Проблема с оплатой / картой",
  "cancel.reason.changedMind": "Передумал(а)",
  "cancel.reason.mistake": "Оформил(а) по ошибке",
  "cancel.reason.cheaper": "Нашёл(ла) дешевле",
  "cancel.reason.other": "Другое",
  "cancel.otherPlaceholder": "Опишите причину",
  "cancel.failed": "Не удалось отменить заказ",
  "order.giftBadge": "🎁 Подарок",
  "order.npDelivery": "Новая Почта · {city}",

  // ── online payment (monobank) on the order page ──────────────────────────
  "pay.title": "Оплата",
  "pay.due": "К оплате",
  "pay.button": "Оплатить {amount}",
  "pay.hint": "Форма monobank откроется прямо здесь, в приложении: карта или monobank. Для Apple Pay / Google Pay — «Открыть в браузере».",
  "pay.prepayment": "Предоплата онлайн, остальное {amount} — при получении.",
  "pay.until": "Оплатите до {when}",
  "pay.left": "осталось {time}",
  "pay.hm": "{h} ч {m} мин",
  "pay.m": "{m} мин",
  "pay.timeUp": "Время на оплату истекло",
  "pay.failed": "Оплата не прошла: {reason}",
  "pay.failedGeneric": "Оплата не прошла. Попробуйте ещё раз или другой картой.",
  "pay.retry": "Попробовать ещё раз · {amount}",
  "pay.checking": "Проверяем оплату…",
  "pay.checkingText": "Обычно это несколько секунд.",
  "pay.stillProcessing": "Банк ещё обрабатывает платёж. Статус обновится сам, а бот пришлёт сообщение.",
  "pay.checkAgain": "Проверить ещё раз",
  "pay.paid": "Оплачено {amount}",
  "pay.method.card": "Карта •• {last4}",
  "pay.method.apple": "Apple Pay",
  "pay.method.google": "Google Pay",
  "pay.method.monobank": "monobank",
  "pay.cod": "При получении: {amount}",
  "pay.willConfirm": "Мы проверим наличие и подтвердим заказ.",
  "pay.timeout": "Отменён — не оплачен в течение суток",
  "pay.unavailable": "Онлайн-оплата временно недоступна",
  "pay.unavailableText": "Напишите нам в чат — поможем завершить заказ.",
  "pay.sheetTitle": "Оплата · {amount}",
  "pay.sheetLoading": "Загружаем форму monobank…",
  "pay.openBrowser": "Открыть в браузере (Apple Pay / Google Pay)",

  // ── карта отделений Новой Почты ───────────────────────────────────────────
  "np.cat.all": "Все",
  "np.cat.branch": "Отделения",
  "np.cat.postomat": "Почтоматы",
  "np.cat.point": "Пункты",
  "np.type.branch": "Отделение",
  "np.type.postomat": "Почтомат",
  "np.type.point": "Пункт",
  "np.hint": "Тапните по отделению на карте",
  "np.confirm": "Выбрать это отделение",
  "np.number": "№ {n}",

  // ── оформление ────────────────────────────────────────────────────────────
  "checkout.title": "Оформление",
  "checkout.step.contacts": "Контакты",
  "checkout.step.delivery": "Доставка",
  "checkout.step.payment": "Оплата",
  "checkout.step.done": "Готово",
  "checkout.emptyCart": "Корзина пуста.",
  "checkout.failed": "Не удалось оформить заказ",
  "checkout.submitPay": "Оформить и оплатить {amount}",
  "checkout.redirecting": "Открываем оплату…",
  "checkout.promoDropped": "{message}. Промокод убран — оформите заказ ещё раз.",

  "checkout.contacts.intro": "Куда и кому доставить заказ — начнём с контактов.",
  "checkout.contacts.name": "Имя и фамилия",
  "checkout.contacts.nameError": "Укажите имя",
  "checkout.contacts.phone": "Телефон",
  "checkout.contacts.phoneError": "Введите номер: +38 (0XX) XXX-XX-XX",

  "checkout.delivery.np": "Новая Почта",
  "checkout.delivery.npSubtitle": "Отделение / почтомат",
  "checkout.delivery.pickup": "Самовывоз",
  "checkout.delivery.pickupSubtitle": "Из точки магазина",
  "checkout.delivery.mapHint": "Найдите отделение на карте и нажмите «Выбрать».",
  "checkout.delivery.change": "Изменить отделение",
  "checkout.delivery.required": "Выберите отделение — в списке или на карте.",
  "checkout.delivery.pickupText": "Заберите заказ из точки магазина — мы свяжемся с вами насчёт адреса и времени.",
  "checkout.delivery.mapLoading": "Загрузка карты…",
  "checkout.delivery.comment": "Комментарий к заказу (необязательно)",
  "checkout.prefilled": "Подставили данные из вашего прошлого заказа.",
  "checkout.np.modeText": "Ввести вручную",
  "checkout.np.modeMap": "Выбрать на карте",
  "checkout.np.city": "Город",
  "checkout.np.cityPlaceholder": "Начните вводить название",
  "checkout.np.cityNone": "Город не найден",
  "checkout.np.warehouse": "Отделение / почтомат",
  "checkout.np.warehousePlaceholder": "Номер или адрес",
  "checkout.np.warehouseNone": "В этом городе такого отделения нет",
  "checkout.np.lastWarehouse": "Как в прошлом заказе",
  "checkout.np.changeLast": "Выбрать другое",

  "checkout.payment.error": "Не удалось загрузить варианты оплаты.",
  "checkout.payment.none": "Варианты оплаты не настроены.",
  "checkout.payment.full": "Вся сумма онлайн: карта, Apple Pay или Google Pay",
  "checkout.payment.prepayOnline": "{amount} онлайн сейчас, остальное — наличными при получении",
  "checkout.payment.trust": "Оплата через monobank — данные карты магазин не видит",
  "checkout.payment.deadline": "Оплатите в течение 24 часов, иначе заказ отменится автоматически.",

  "checkout.confirm.items": "Состав",
  "checkout.confirm.sum": "Сумма",
  "checkout.confirm.discount": "Скидка",
  "checkout.confirm.discountWithCode": "Скидка · {code}",
  "checkout.confirm.total": "Итого",
  "checkout.confirm.dueNow": "К оплате сейчас",
  "checkout.confirm.rest": "Остаток {amount} — при получении.",
  "checkout.confirm.promoProblem": "Промокод «{code}»: {message}",
  "checkout.confirm.promoChecking": "проверяем…",

  // ── payment return page (opened in a browser, outside Telegram) ──────────
  "payReturn.title": "Спасибо! Оплата принята в обработку",
  "payReturn.text": "Закройте это окно — вы вернётесь в магазин в Telegram. Статус оплаты обновится автоматически, а бот пришлёт сообщение.",
  "payReturn.order": "Заказ {id}",
  "payReturn.back": "Вернуться в Telegram",
  "payReturn.closeHint": "Окно не закрылось само — закройте его крестиком или кнопкой «Готово» вверху.",
  "payReturn.embedded": "Оплата принята в обработку…",
  "payReturn.embeddedText": "Возвращаемся к заказу",
} satisfies Dictionary;

/**
 * The contract the other languages must satisfy: the same keys, and the same KIND of value —
 * a phrase stays a phrase, a plural stays a plural. It deliberately does not demand the same
 * plural FORMS: English has two where Russian and Ukrainian have three, and padding `few`/`many`
 * with duplicated English would be noise that reads like a mistake.
 */
export type RuDictionary = {
  [K in keyof typeof ru]: (typeof ru)[K] extends string ? string : PluralPhrase;
};
