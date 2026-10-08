-- ============================================================================
--  Admin e2e fixture. Applied by e2e/global-setup.ts AFTER Flyway (the backend is up), before
--  every run, so a run always starts from the same state.
--
--  Everything here is invented: names, phones, Telegram ids, monobank invoice ids and card masks.
--  No production data. Payment is online only (monobank).
--
--  Ids are readable on purpose: an order's short number on screen is the first 8 hex chars of
--  its UUID, so order e2e00005-… shows up as #e2e00005. The same ids live in e2e/lib/seed.ts.
--  Money is in minor units (kopiyky). Times are relative to NOW() (UTC, like the backend).
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM order_messages;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM cart_items;
DELETE FROM carts;
DELETE FROM promo_reservations;
DELETE FROM promo_codes;
DELETE FROM web_sessions;
DELETE FROM web_login_tokens;
DELETE FROM users;
DELETE FROM product_tags;
DELETE FROM product_images;
DELETE FROM product_variants;
DELETE FROM products;
DELETE FROM tags;
DELETE FROM content_translations;
DELETE FROM client_events;
DELETE FROM analytics_daily;
DELETE FROM analytics_daily_visitors;
DELETE FROM analytics_daily_runs;
DELETE FROM payment_invoices;
DELETE FROM payment_webhook_log;
DELETE FROM payment_options;
DELETE FROM inbox_marks;
DELETE FROM shop_settings;
DELETE FROM admin_audit_log;
DELETE FROM broadcasts;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------- Payment (all online via monobank) ----------
-- Orders keep a snapshot of the option title, so the older orders below still say
-- «Оплата при получении» — they were placed before online payment (payment_due_at NULL).
INSERT INTO payment_options (id, title, description, requires_prepayment, prepayment_minor, sort_order, active) VALUES
  (UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000001'), 'Предоплата 150 ₴',
   '150 ₴ онлайн сейчас, остаток — наложкой при получении.', TRUE, 15000, 1, TRUE),
  (UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Предоплата 100 ₴',
   '100 ₴ онлайн сейчас, остаток — наложкой при получении.', TRUE, 10000, 2, TRUE),
  (UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000003'), 'Полная оплата онлайн',
   'Вся сумма заказа онлайн: карта, Apple Pay, Google Pay.', FALSE, 0, 3, TRUE);

-- ---------- Catalog ----------
INSERT INTO tags (id, name, slug, sort_order, show_in_menu) VALUES
  (UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000001'), 'E2E Футболки', 'e2e-futbolki', 1, TRUE),
  (UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000002'), 'E2E Аксессуары', 'e2e-aksessuary', 2, TRUE);

INSERT INTO products (id, title, slug, description, price_minor, currency, stock, active, archived) VALUES
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), 'E2E Футболка базовая', 'e2e-futbolka-bazovaya',
   'Хлопок 100%.', 59900, 'UAH', 7, TRUE, FALSE),
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 'e2e-kepka',
   'Регулируемый ремешок.', 34900, 'UAH', 10, TRUE, FALSE),
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000003'), 'E2E Рюкзак городской', 'e2e-ryukzak',
   'Два отделения, 20 л.', 129900, 'UAH', 3, TRUE, FALSE),
  -- Not in any order: edited by the product tests only.
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000004'), 'E2E Носки', 'e2e-noski',
   'Тёплые носки.', 9900, 'UAH', 40, TRUE, FALSE),
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000005'), 'E2E Шарф', 'e2e-sharf',
   'Вязаный шарф.', 49900, 'UAH', 12, TRUE, FALSE);

INSERT INTO product_variants (id, product_id, name, stock, sort_order) VALUES
  (UUID_TO_BIN('e2e0e001-0000-4000-8000-000000000001'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), 'S', 5, 0),
  (UUID_TO_BIN('e2e0e001-0000-4000-8000-000000000002'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), 'M', 2, 1);

INSERT INTO product_tags (product_id, tag_id) VALUES
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000001')),
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000002')),
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000003'), UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000002')),
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000004'), UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000002')),
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000005'), UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000002'));

-- ---------- Customers (invented Telegram ids) ----------
INSERT INTO users (telegram_user_id, username, first_name, last_name, language_code, locale, created_at) VALUES
  (900000001, 'e2e_olena', 'Олена', 'Тестова', 'uk', 'uk', NOW() - INTERVAL 10 DAY),
  (900000003, 'e2e_maria', 'Марія', 'Чатова', 'ru', 'ru', NOW() - INTERVAL 10 DAY);

-- ---------- Orders ----------
-- Common delivery: Nova Poshta, invented branch.
INSERT INTO orders (id, user_id, subtotal_minor, discount_minor, total_minor, currency, customer_name, phone,
                    status, approved_at, shipped_at, delivered_at, rejected_at, tracking_number,
                    reject_reason, reject_reason_code, delivery_method, np_city_ref, np_city_name,
                    np_warehouse_ref, np_warehouse_name, payment_option_id, payment_option_title,
                    paid, paid_at, prepayment_minor, received_minor,
                    tg_user_id, tg_username, source, created_at) VALUES
  -- #e2e00001: NEW with a 150 ₴ prepayment, nothing paid yet (payment modal test).
  (UUID_TO_BIN('e2e00001-0000-4000-8000-000000000001'), 900000001, 94800, 0, 94800, 'UAH', 'Олена Тестова', '+380000000001',
   'NEW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1',
   'Відділення №1 (тест): вул. Вигадана, 1', UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000001'), 'Предоплата 150 ₴',
   FALSE, NULL, 15000, 0, 900000001, 'e2e_olena', 'MINIAPP', NOW() - INTERVAL 1 HOUR),
  -- #e2e00002: NEW, 150 ₴ online prepayment still due (link issued), 5 h old — «Ждёт оплаты», dispatch.
  (UUID_TO_BIN('e2e00002-0000-4000-8000-000000000002'), NULL, 129900, 0, 129900, 'UAH', 'Петро Вигаданий', '+380000000002',
   'NEW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1',
   'Відділення №1 (тест): вул. Вигадана, 1', UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000001'), 'Предоплата 150 ₴',
   FALSE, NULL, 15000, 0, NULL, NULL, 'WEB', NOW() - INTERVAL 5 HOUR),
  -- #e2e00003: NEW with an unread customer message (inbox «Непрочитанные чаты», chat templates).
  (UUID_TO_BIN('e2e00003-0000-4000-8000-000000000003'), 900000003, 59900, 0, 59900, 'UAH', 'Марія Чатова', '+380000000003',
   'NEW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1',
   'Відділення №1 (тест): вул. Вигадана, 1', UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   FALSE, NULL, 0, 0, 900000003, 'e2e_maria', 'MINIAPP', NOW() - INTERVAL 30 MINUTE),
  -- #e2e00004: NEW for 6 h — «Новые без одобрения» (snooze test).
  (UUID_TO_BIN('e2e00004-0000-4000-8000-000000000004'), NULL, 69800, 0, 69800, 'UAH', 'Іван Застряглий', '+380000000004',
   'NEW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1',
   'Відділення №1 (тест): вул. Вигадана, 1', UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   FALSE, NULL, 0, 0, NULL, NULL, 'MINIAPP', NOW() - INTERVAL 6 HOUR),
  -- #e2e00005: NEW → APPROVED → SHIPPED flow.
  (UUID_TO_BIN('e2e00005-0000-4000-8000-000000000005'), NULL, 34900, 0, 34900, 'UAH', 'Оксана Статусна', '+380000000005',
   'NEW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1',
   'Відділення №1 (тест): вул. Вигадана, 1', UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   FALSE, NULL, 0, 0, NULL, NULL, 'MINIAPP', NOW() - INTERVAL 40 MINUTE),
  -- #e2e00006: APPROVED — "the next order" whose ТТН field must start empty.
  (UUID_TO_BIN('e2e00006-0000-4000-8000-000000000006'), NULL, 59900, 0, 59900, 'UAH', 'Тарас Схвалений', '+380000000006',
   'APPROVED', NOW() - INTERVAL 2 HOUR, NULL, NULL, NULL, NULL, NULL, NULL, 'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1',
   'Відділення №1 (тест): вул. Вигадана, 1', UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   FALSE, NULL, 0, 0, NULL, NULL, 'MINIAPP', NOW() - INTERVAL 3 HOUR),
  -- #e2e00007: APPROVED, paid in full — shipped from «Отправка».
  (UUID_TO_BIN('e2e00007-0000-4000-8000-000000000007'), NULL, 129900, 0, 129900, 'UAH', 'Ганна Відправка', '+380000000007',
   'APPROVED', NOW() - INTERVAL 1 HOUR, NULL, NULL, NULL, NULL, NULL, NULL, 'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1',
   'Відділення №1 (тест): вул. Вигадана, 1', UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000003'), 'Полная оплата онлайн',
   TRUE, NOW() - INTERVAL 1 HOUR, 0, 129900, NULL, NULL, 'WEB', NOW() - INTERVAL 2 HOUR),
  -- #e2e00008: NEW — rejected with a reason from the list.
  (UUID_TO_BIN('e2e00008-0000-4000-8000-000000000008'), NULL, 34900, 0, 34900, 'UAH', 'Богдан Відмова', '+380000000008',
   'NEW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1',
   'Відділення №1 (тест): вул. Вигадана, 1', UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   FALSE, NULL, 0, 0, NULL, NULL, 'MINIAPP', NOW() - INTERVAL 50 MINUTE),
  -- #e2e00009: DELIVERED and paid — partial return of one line.
  (UUID_TO_BIN('e2e00009-0000-4000-8000-000000000009'), NULL, 94800, 0, 94800, 'UAH', 'Світлана Повернення', '+380000000009',
   'DELIVERED', NOW() - INTERVAL 4 DAY, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 1 DAY, NULL, '20450000000009', NULL, NULL,
   'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1', 'Відділення №1 (тест): вул. Вигадана, 1',
   UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000003'), 'Полная оплата онлайн',
   TRUE, NOW() - INTERVAL 1 DAY, 0, 94800, NULL, NULL, 'MINIAPP', NOW() - INTERVAL 5 DAY),
  -- #e2e0000a: refused at the post office after shipping — «Отказы и возвраты» (dismissible).
  (UUID_TO_BIN('e2e0000a-0000-4000-8000-00000000000a'), NULL, 34900, 0, 34900, 'UAH', 'Юрій Відмовник', '+380000000010',
   'REJECTED', NOW() - INTERVAL 4 DAY, NOW() - INTERVAL 3 DAY, NULL, NOW() - INTERVAL 1 DAY, '20450000000010',
   'Не забрал посылку', 'REFUSED_AT_POST', 'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1',
   'Відділення №1 (тест): вул. Вигадана, 1', UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   FALSE, NULL, 0, 0, NULL, NULL, 'MINIAPP', NOW() - INTERVAL 5 DAY),
  -- #e2e0000b: SHIPPED — read-only target of the board tests (search, card, Esc layers).
  (UUID_TO_BIN('e2e0000b-0000-4000-8000-00000000000b'), NULL, 59900, 0, 59900, 'UAH', 'Андрій Посилка', '+380000000011',
   'SHIPPED', NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 1 DAY, NULL, NULL, '59000000000011', NULL, NULL,
   'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1', 'Відділення №1 (тест): вул. Вигадана, 1',
   UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   FALSE, NULL, 0, 0, NULL, NULL, 'MINIAPP', NOW() - INTERVAL 2 DAY),
  -- #e2e0000c: NEW — the «Журнал» test changes its status through the API.
  (UUID_TO_BIN('e2e0000c-0000-4000-8000-00000000000c'), NULL, 34900, 0, 34900, 'UAH', 'Лариса Журнальна', '+380000000012',
   'NEW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'PICKUP', NULL, NULL, NULL, NULL,
   UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   FALSE, NULL, 0, 0, NULL, NULL, 'ADMIN', NOW() - INTERVAL 35 MINUTE),
  -- #e2e0000d: NEW, 150 ₴ prepayment paid online (monobank invoice below) — inbox «Оплаты»
  -- («Оплачен онлайн — подтвердите заказ»), the online payment block and the refund dialog.
  (UUID_TO_BIN('e2e0000d-0000-4000-8000-00000000000d'), NULL, 34900, 0, 34900, 'UAH', 'Віра Онлайн', '+380000000013',
   'NEW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1',
   'Відділення №1 (тест): вул. Вигадана, 1', UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000001'), 'Предоплата 150 ₴',
   TRUE, NOW() - INTERVAL 10 MINUTE, 15000, 15000, NULL, NULL, 'WEB', NOW() - INTERVAL 15 MINUTE),
  -- #e2e0000e: DELIVERED and paid — the customer exchanges the cap for a backpack (exchange spec).
  (UUID_TO_BIN('e2e0000e-0000-4000-8000-00000000000e'), NULL, 34900, 0, 34900, 'UAH', 'Ольга Обмінна', '+380000000014',
   'DELIVERED', NOW() - INTERVAL 4 DAY, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 1 DAY, NULL, '20450000000014', NULL, NULL,
   'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1', 'Відділення №1 (тест): вул. Вигадана, 1',
   UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000003'), 'Полная оплата онлайн',
   TRUE, NOW() - INTERVAL 1 DAY, 0, 34900, NULL, NULL, 'MINIAPP', NOW() - INTERVAL 5 DAY);

-- Online payment deadlines (24 h after the order). Orders above without one were placed before
-- online payment and are never cancelled automatically.
UPDATE orders SET payment_due_at = created_at + INTERVAL 24 HOUR
 WHERE id IN (UUID_TO_BIN('e2e00002-0000-4000-8000-000000000002'),
              UUID_TO_BIN('e2e0000d-0000-4000-8000-00000000000d'));

-- monobank invoices (invented ids). #e2e00002: link issued, not paid yet. #e2e0000d: paid by card,
-- credited to the order (applied_at) — what makes it «оплачен онлайн» for the inbox.
INSERT INTO payment_invoices (id, order_id, provider, external_id, amount_minor, final_amount_minor, refunded_minor,
                              ccy, status, page_url, expires_at, provider_modified_at, failure_reason, err_code,
                              masked_pan, payment_method, payment_system, rrn, approval_code, fee_minor, applied_at,
                              refund_pending_until, created_at, updated_at) VALUES
  (UUID_TO_BIN('e2e0f001-0000-4000-8000-000000000002'), UUID_TO_BIN('e2e00002-0000-4000-8000-000000000002'),
   'MONOBANK', 'e2e-inv-awaiting-0002', 15000, NULL, 0, 980, 'created', 'https://pay.mbnk.biz/e2e-inv-awaiting-0002',
   NOW() + INTERVAL 19 HOUR, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NOW() - INTERVAL 5 HOUR, NOW() - INTERVAL 5 HOUR),
  (UUID_TO_BIN('e2e0f001-0000-4000-8000-00000000000d'), UUID_TO_BIN('e2e0000d-0000-4000-8000-00000000000d'),
   'MONOBANK', 'e2e-inv-paid-000d', 15000, 15000, 0, 980, 'success', 'https://pay.mbnk.biz/e2e-inv-paid-000d',
   NOW() + INTERVAL 23 HOUR, NOW() - INTERVAL 10 MINUTE, NULL, NULL, '444403******1902', 'pan', 'visa',
   '000000e2e0d1', '123456', 195, NOW() - INTERVAL 10 MINUTE,
   NULL, NOW() - INTERVAL 15 MINUTE, NOW() - INTERVAL 10 MINUTE);

INSERT INTO order_items (order_id, product_id, title_snapshot, price_minor_snapshot, variant_id, variant_name_snapshot,
                         quantity, gift, returned_qty, restocked_qty) VALUES
  (UUID_TO_BIN('e2e00001-0000-4000-8000-000000000001'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 34900, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00001-0000-4000-8000-000000000001'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), 'E2E Футболка базовая', 59900,
   UUID_TO_BIN('e2e0e001-0000-4000-8000-000000000001'), 'S', 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00002-0000-4000-8000-000000000002'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000003'), 'E2E Рюкзак городской', 129900, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00003-0000-4000-8000-000000000003'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), 'E2E Футболка базовая', 59900,
   UUID_TO_BIN('e2e0e001-0000-4000-8000-000000000002'), 'M', 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00004-0000-4000-8000-000000000004'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 34900, NULL, NULL, 2, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00005-0000-4000-8000-000000000005'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 34900, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00006-0000-4000-8000-000000000006'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), 'E2E Футболка базовая', 59900,
   UUID_TO_BIN('e2e0e001-0000-4000-8000-000000000001'), 'S', 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00007-0000-4000-8000-000000000007'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000003'), 'E2E Рюкзак городской', 129900, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00008-0000-4000-8000-000000000008'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 34900, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00009-0000-4000-8000-000000000009'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), 'E2E Футболка базовая', 59900,
   UUID_TO_BIN('e2e0e001-0000-4000-8000-000000000001'), 'S', 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00009-0000-4000-8000-000000000009'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 34900, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e0000a-0000-4000-8000-00000000000a'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 34900, NULL, NULL, 1, FALSE, 0, 1),
  (UUID_TO_BIN('e2e0000b-0000-4000-8000-00000000000b'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), 'E2E Футболка базовая', 59900,
   UUID_TO_BIN('e2e0e001-0000-4000-8000-000000000002'), 'M', 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e0000c-0000-4000-8000-00000000000c'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 34900, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e0000d-0000-4000-8000-00000000000d'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 34900, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e0000e-0000-4000-8000-00000000000e'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 34900, NULL, NULL, 1, FALSE, 0, 0);

INSERT INTO order_messages (order_id, sender_type, sender_id, sender_name, type, text, created_at, delivered_at, read_at) VALUES
  (UUID_TO_BIN('e2e00003-0000-4000-8000-000000000003'), 'CUSTOMER', 900000003, 'Марія Чатова', 'TEXT',
   'Добрий день! Коли відправите?', NOW() - INTERVAL 25 MINUTE, NOW() - INTERVAL 25 MINUTE, NULL);
