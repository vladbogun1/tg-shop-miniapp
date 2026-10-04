-- ============================================================
--  Структурированные события покупателя + события сайта.
--
--  До этого client_events писал только Mini App, и только «текст кнопки»:
--  понять, какой товар открыли или положили в корзину, можно было лишь
--  угадывая по названию. Теперь клиенты шлют события product_view /
--  add_to_cart / checkout_start / order_created с productId в meta (JSON),
--  а сервер раскладывает productId в отдельную колонку для агрегатов.
--
--  Сайт пишет в ту же таблицу с channel = 'WEB'. До входа у посетителя нет
--  Telegram-аккаунта, поэтому telegram_user_id теперь NULL-able, а сам
--  посетитель опознаётся по анонимному id из браузера (anon_id).
--  Старые текстовые события (click/view/error) остаются как есть.
-- ============================================================

ALTER TABLE client_events
    MODIFY COLUMN telegram_user_id BIGINT NULL,
    ADD COLUMN channel    ENUM('MINIAPP','WEB') NOT NULL DEFAULT 'MINIAPP' AFTER id,
    ADD COLUMN anon_id    VARCHAR(64) NULL AFTER telegram_user_id,
    ADD COLUMN product_id BINARY(16)  NULL AFTER meta,
    ADD KEY idx_client_events_product (product_id, created_at);
