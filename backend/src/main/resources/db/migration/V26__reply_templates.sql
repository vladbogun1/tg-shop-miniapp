-- ============================================================
--  Шаблоны ответов в чате заказа (кнопка ⚡ в админке).
--  Текст хранится на трёх языках; при вставке выбирается язык
--  клиента (users.locale), запасной — украинский, затем русский.
--  Плейсхолдеры: {name} {orderNo} {total} {cod} {ttn} {warehouse} {requisites}
-- ============================================================

CREATE TABLE reply_templates (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    title      VARCHAR(128) NOT NULL,
    body_ru    TEXT         NOT NULL,
    body_uk    TEXT         NULL,
    body_en    TEXT         NULL,
    sort       INT          NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_reply_templates_sort (sort, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO reply_templates (title, body_ru, body_uk, body_en, sort) VALUES
('Реквизиты для оплаты',
 'Здравствуйте, {name}! Реквизиты для оплаты заказа #{orderNo} на сумму {total}:\n{requisites}\nПосле оплаты пришлите, пожалуйста, скриншот сюда в чат.',
 'Вітаємо, {name}! Реквізити для оплати замовлення #{orderNo} на суму {total}:\n{requisites}\nПісля оплати надішліть, будь ласка, скриншот сюди в чат.',
 'Hello, {name}! Payment details for order #{orderNo}, amount {total}:\n{requisites}\nOnce paid, please send a screenshot here in the chat.',
 10),
('Отправим сегодня/завтра',
 '{name}, ваш заказ #{orderNo} отправим сегодня или завтра. Как только будет номер ТТН — пришлём его сюда.',
 '{name}, ваше замовлення #{orderNo} відправимо сьогодні або завтра. Щойно буде номер ТТН — надішлемо його сюди.',
 '{name}, we will ship your order #{orderNo} today or tomorrow. We will post the tracking number here as soon as we have it.',
 20),
('Ваша ТТН',
 'Заказ #{orderNo} отправлен Новой Почтой.\nТТН: {ttn}\nОтделение: {warehouse}\nК оплате при получении: {cod}.',
 'Замовлення #{orderNo} відправлено Новою Поштою.\nТТН: {ttn}\nВідділення: {warehouse}\nДо сплати при отриманні: {cod}.',
 'Order #{orderNo} has been shipped with Nova Poshta.\nTracking number: {ttn}\nBranch: {warehouse}\nTo pay on delivery: {cod}.',
 30),
('Товар закончился — замена',
 '{name}, к сожалению, товар из заказа #{orderNo} закончился. Можем предложить замену — напишите, подойдёт ли вам другой вариант, или мы вернём деньги.',
 '{name}, на жаль, товар із замовлення #{orderNo} закінчився. Можемо запропонувати заміну — напишіть, чи підійде вам інший варіант, або ми повернемо кошти.',
 '{name}, unfortunately an item from order #{orderNo} is out of stock. We can offer a replacement — let us know if another option works for you, or we will refund the money.',
 40),
('Спасибо + отзыв',
 'Спасибо за покупку, {name}! Будем очень рады вашему отзыву — это помогает нашему магазину 🙌',
 'Дякуємо за покупку, {name}! Будемо дуже раді вашому відгуку — це допомагає нашому магазину 🙌',
 'Thank you for your purchase, {name}! We would love to hear your feedback — it really helps our shop 🙌',
 50);
