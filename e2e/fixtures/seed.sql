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
DELETE FROM spec_options;
DELETE FROM spec_attributes;
DELETE FROM spec_groups;
DELETE FROM categories;
DELETE FROM brands;
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
DELETE FROM product_reviews;
DELETE FROM support_messages;
DELETE FROM support_threads;

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
-- Catalog v2 (V52): categories (a flat tree of two leaves here), products sit in a leaf.
INSERT INTO categories (id, name, slug, sort_order, show_in_menu) VALUES
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

UPDATE products SET category_id = UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000001')
 WHERE id = UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001');
UPDATE products SET category_id = UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000002')
 WHERE id IN (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000003'),
              UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000004'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000005'));
-- Seeded products are finished cards (the publishing gate only applies to drafts).
UPDATE products SET card_status = 'READY' WHERE id IN (
  UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'),
  UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000003'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000004'),
  UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000005'));

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

-- ============================================================================
--  Specs 23+ (sections that had no spec): their own rows, so the rows above stay as they were.
-- ============================================================================

-- ---------- «Товары» (32-products-list) and the «Карточки» badge regression (31-sidebar-badges) ----------
INSERT INTO products (id, title, slug, description, price_minor, currency, stock, active, archived, card_status, unfinished, category_id) VALUES
  -- On the storefront, finished: hidden / shown / archived / restored by the products-list spec.
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000006'), 'E2E Термос', 'e2e-termos',
   'Сталь, 0,5 л.', 79900, 'UAH', 25, TRUE, FALSE, 'READY', FALSE, UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000002')),
  -- An OLD hidden product the AI once filled: not work, so it must not count in the «Карточки» badge
  -- (bug: the badge said 2 while «Оформить» and «Проверить» were empty).
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000007'), 'E2E Старый плеер', 'e2e-staryi-pleer',
   'Снят с продажи.', 19900, 'UAH', 5, FALSE, FALSE, 'AI_FILLED', FALSE, UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000002')),
  -- Archived: its published review is not counted on the site (25-reviews).
  (UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000008'), 'E2E Архивный чайник', 'e2e-arhivnyi-chainik',
   'В архиве.', 29900, 'UAH', 0, FALSE, TRUE, 'READY', FALSE, UUID_TO_BIN('e2e0c001-0000-4000-8000-000000000002'));

-- Characteristic group «Основное»: the attribute dialog offers «main» (with no groups at all the save
-- fails with «group «main» не найдена» — see the 23-categories note).
INSERT INTO spec_groups (`key`, label_ru, label_uk, label_en, sort_order) VALUES ('main', 'Основное', 'Основне', 'Main', 0);

-- ---------- «Бренды» (24-brands): one seeded brand; the spec creates another and merges it in ----------
INSERT INTO brands (id, name, slug, aliases, website, sort_order) VALUES
  (UUID_TO_BIN('e2e0a001-0000-4000-8000-000000000001'), 'E2E Logitech', 'e2e-logitech', NULL, 'https://example.com', 0);

-- ---------- Customers of the users / metrics / broadcast specs (invented Telegram ids) ----------
INSERT INTO users (telegram_user_id, username, first_name, last_name, language_code, locale, bot_blocked, created_at) VALUES
  (900000201, 'e2e_zinoviy', 'Зиновій', 'Метриченко', 'uk', 'uk', FALSE, '2025-03-01 09:00:00'),
  (900000202, 'e2e_yaryna', 'Ярина', 'Каналова', 'uk', 'uk', FALSE, '2025-03-01 09:00:00'),
  (900000203, 'e2e_stepan', 'Степан', 'Сайтовий', 'ru', 'ru', FALSE, '2025-03-01 09:00:00'),
  (900000204, 'e2e_fedir', 'Федір', 'Заблокований', 'uk', 'uk', TRUE, '2025-03-01 09:00:00');

-- ---------- «Метрики» (29-metrics-values): five orders in March 2025, both channels ----------
-- Far in the past on purpose: the spec picks the custom period 2025-03-01 … 2025-03-31, where these
-- are the only orders, so every number is known. None is NEW / APPROVED (no «Внимание» rows).
--   #e2e00101 MINIAPP 900000201 DELIVERED, paid 1000 ₴ on 03-05            → sold, paid, shipped
--   #e2e00102 MINIAPP 900000202 SHIPPED, cash on delivery 500 ₴ not paid   → sold, shipped
--   #e2e00103 WEB     900000203 SHIPPED, paid 700 ₴ (promo E2ERESERVE −70) → sold, paid, shipped
--   #e2e00104 WEB     900000204 REJECTED before shipping, 300 ₴            → not sold
--   #e2e00105 MINIAPP 900000201 DELIVERED, paid 200 ₴ at delivery          → sold, paid, shipped
-- All: 4 orders, sold 2400 ₴, received 1900 ₴, rejects 1 of 5 = 20 %.
-- Funnel (unique buyers): ordered 4 (2 + 2), paid 2 (1 + 1), shipped 3 (2 + 1).
INSERT INTO orders (id, user_id, subtotal_minor, discount_minor, total_minor, currency, customer_name, phone,
                    status, approved_at, shipped_at, delivered_at, rejected_at, tracking_number,
                    reject_reason, reject_reason_code, delivery_method, np_city_ref, np_city_name,
                    np_warehouse_ref, np_warehouse_name, payment_option_id, payment_option_title,
                    paid, paid_at, prepayment_minor, received_minor, promo_code,
                    tg_user_id, tg_username, source, created_at) VALUES
  (UUID_TO_BIN('e2e00101-0000-4000-8000-000000000101'), 900000201, 100000, 0, 100000, 'UAH', 'Зиновій Метриченко', '+380000000101',
   'DELIVERED', '2025-03-03 12:00:00', '2025-03-04 12:00:00', '2025-03-06 12:00:00', NULL, '20450000000101', NULL, NULL,
   'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1', 'Відділення №1 (тест): вул. Вигадана, 1',
   UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000003'), 'Полная оплата онлайн',
   TRUE, '2025-03-05 12:00:00', 0, 100000, NULL, 900000201, 'e2e_zinoviy', 'MINIAPP', '2025-03-03 10:00:00'),
  (UUID_TO_BIN('e2e00102-0000-4000-8000-000000000102'), 900000202, 50000, 0, 50000, 'UAH', 'Ярина Каналова', '+380000000102',
   'SHIPPED', '2025-03-10 12:00:00', '2025-03-11 12:00:00', NULL, NULL, '20450000000102', NULL, NULL,
   'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1', 'Відділення №1 (тест): вул. Вигадана, 1',
   UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   FALSE, NULL, 0, 0, NULL, 900000202, 'e2e_yaryna', 'MINIAPP', '2025-03-10 10:00:00'),
  (UUID_TO_BIN('e2e00103-0000-4000-8000-000000000103'), 900000203, 77000, 7000, 70000, 'UAH', 'Степан Сайтовий', '+380000000103',
   'SHIPPED', '2025-03-12 12:00:00', '2025-03-13 12:00:00', NULL, NULL, '20450000000103', NULL, NULL,
   'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1', 'Відділення №1 (тест): вул. Вигадана, 1',
   UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000003'), 'Полная оплата онлайн',
   TRUE, '2025-03-12 12:00:00', 0, 70000, 'E2ERESERVE', 900000203, 'e2e_stepan', 'WEB', '2025-03-11 10:00:00'),
  (UUID_TO_BIN('e2e00104-0000-4000-8000-000000000104'), 900000204, 30000, 0, 30000, 'UAH', 'Федір Заблокований', '+380000000104',
   'REJECTED', NULL, NULL, NULL, '2025-03-16 12:00:00', NULL, 'Передумал', NULL,
   'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1', 'Відділення №1 (тест): вул. Вигадана, 1',
   UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   FALSE, NULL, 0, 0, NULL, 900000204, 'e2e_fedir', 'WEB', '2025-03-15 10:00:00'),
  (UUID_TO_BIN('e2e00105-0000-4000-8000-000000000105'), 900000201, 20000, 0, 20000, 'UAH', 'Зиновій Метриченко', '+380000000101',
   'DELIVERED', '2025-03-20 12:00:00', '2025-03-21 12:00:00', '2025-03-23 12:00:00', NULL, '20450000000105', NULL, NULL,
   'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1', 'Відділення №1 (тест): вул. Вигадана, 1',
   UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000002'), 'Оплата при получении',
   TRUE, '2025-03-23 12:00:00', 0, 20000, NULL, 900000201, 'e2e_zinoviy', 'MINIAPP', '2025-03-20 10:00:00');

INSERT INTO order_items (order_id, product_id, title_snapshot, price_minor_snapshot, variant_id, variant_name_snapshot,
                         quantity, gift, returned_qty, restocked_qty) VALUES
  (UUID_TO_BIN('e2e00101-0000-4000-8000-000000000101'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000003'), 'E2E Рюкзак городской', 100000, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00102-0000-4000-8000-000000000102'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 50000, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00103-0000-4000-8000-000000000103'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 77000, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00104-0000-4000-8000-000000000104'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 30000, NULL, NULL, 1, FALSE, 0, 0),
  (UUID_TO_BIN('e2e00105-0000-4000-8000-000000000105'), UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), 'E2E Кепка', 20000, NULL, NULL, 1, FALSE, 0, 0);

-- ---------- «Промокоды» (27-promocodes) ----------
-- E2ERESERVE: 1 of 2 used + 1 live reservation → «слоты в резерве»; E2EFULL: limit reached.
INSERT INTO promo_codes (id, code, discount_percent, discount_amount_minor, max_uses, uses_count, active) VALUES
  (UUID_TO_BIN('e2e0aa01-0000-4000-8000-000000000001'), 'E2ERESERVE', 10, 0, 2, 1, TRUE),
  (UUID_TO_BIN('e2e0aa01-0000-4000-8000-000000000002'), 'E2EFULL', 0, 5000, 1, 1, TRUE);
-- «Персональные скидки»: a code for one customer; «За отзывы»: an automatic review bonus.
INSERT INTO promo_codes (id, code, discount_percent, discount_amount_minor, max_uses, uses_count, active, owner_user_id, source, expires_at) VALUES
  (UUID_TO_BIN('e2e0aa01-0000-4000-8000-000000000003'), 'E2EPERSONAL', 5, 0, 1, 0, TRUE, 900000201, NULL, NULL),
  (UUID_TO_BIN('e2e0aa01-0000-4000-8000-000000000004'), 'E2EBONUS', 0, 10000, 1, 0, TRUE, 900000202, 'REVIEW_BONUS', NOW() + INTERVAL 30 DAY);
-- A manual discount given in an order (not a code) — the «Ручные скидки в заказах» block.
UPDATE orders SET subtotal_minor = 22000, discount_minor = 2000, promo_code = 'Ручная скидка'
 WHERE id = UUID_TO_BIN('e2e00105-0000-4000-8000-000000000105');
INSERT INTO promo_reservations (id, promo_code_id, telegram_user_id, expires_at) VALUES
  (UUID_TO_BIN('e2e0aa02-0000-4000-8000-000000000001'), UUID_TO_BIN('e2e0aa01-0000-4000-8000-000000000001'), 900000202,
   NOW() + INTERVAL 30 MINUTE);

-- ---------- «Отзывы» (25-reviews): three waiting for moderation, one published ----------
INSERT INTO product_reviews (id, product_id, order_id, order_item_id, user_id, tg_user_id, author_name, rating, text, status,
                             admin_reply, admin_reply_at, created_at, updated_at, published_at) VALUES
  (9001, UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), NULL, NULL, 900000201, 900000201, 'Зиновій', 5,
   'E2E: чудова футболка, рекомендую', 'PENDING', NULL, NULL, NOW() - INTERVAL 3 HOUR, NOW() - INTERVAL 3 HOUR, NULL),
  (9002, UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000002'), NULL, NULL, 900000202, 900000202, 'Ярина', 2,
   'E2E: кепка маломірить', 'PENDING', NULL, NULL, NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 2 HOUR, NULL),
  (9003, UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000003'), NULL, NULL, 900000203, 900000203, 'Степан', 4,
   'E2E: рюкзак нормальний, спам-тест', 'PENDING', NULL, NULL, NOW() - INTERVAL 1 HOUR, NOW() - INTERVAL 1 HOUR, NULL),
  (9004, UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), NULL, NULL, 900000203, 900000203, 'Степан', 5,
   'E2E: вже опублікований відгук', 'PUBLISHED', NULL, NULL, NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 5 DAY),
  -- Published review of a HIDDEN (sold out, not archived) product: counted on the site, without a link.
  (9005, UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000007'), NULL, NULL, 900000202, 900000202, 'Ярина', 4,
   'E2E: плеер був хороший', 'PUBLISHED', NULL, NULL, NOW() - INTERVAL 6 DAY, NOW() - INTERVAL 6 DAY, NOW() - INTERVAL 6 DAY),
  -- Published review of an ARCHIVED product: not counted on the site.
  (9006, UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000008'), NULL, NULL, 900000201, 900000201, 'Зиновій', 3,
   'E2E: чайник з архіву', 'PUBLISHED', NULL, NULL, NOW() - INTERVAL 7 DAY, NOW() - INTERVAL 7 DAY, NOW() - INTERVAL 7 DAY);

-- ---------- «Поддержка» (28-support): one question waiting for an answer, one closed ----------
INSERT INTO support_threads (id, user_id, tg_user_id, customer_name, product_id, product_title, product_slug, subject, status,
                             source, last_message_at, last_sender, last_preview, customer_unread, admin_unread,
                             awaiting_since, created_at, closed_at, closed_by) VALUES
  (UUID_TO_BIN('e2e05001-0000-4000-8000-000000000001'), 900000203, 900000203, 'Степан Сайтовий',
   UUID_TO_BIN('e2e0d001-0000-4000-8000-000000000001'), 'E2E Футболка базовая', 'e2e-futbolka-bazovaya', NULL, 'OPEN',
   'WEB', NOW() - INTERVAL 20 MINUTE, 'CUSTOMER', 'E2E: а розмір L буде?', 0, 1,
   NOW() - INTERVAL 20 MINUTE, NOW() - INTERVAL 20 MINUTE, NULL, NULL),
  (UUID_TO_BIN('e2e05001-0000-4000-8000-000000000002'), 900000202, 900000202, 'Ярина Каналова',
   NULL, NULL, NULL, 'Доставка', 'CLOSED',
   'MINIAPP', NOW() - INTERVAL 2 DAY, 'ADMIN', 'E2E: відправляємо щодня', 0, 0,
   NULL, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 2 DAY, 'ADMIN');
INSERT INTO support_messages (thread_id, sender_type, sender_id, sender_name, type, text, created_at, read_at) VALUES
  (UUID_TO_BIN('e2e05001-0000-4000-8000-000000000001'), 'CUSTOMER', 900000203, 'Степан Сайтовий', 'TEXT',
   'E2E: а розмір L буде?', NOW() - INTERVAL 20 MINUTE, NULL),
  (UUID_TO_BIN('e2e05001-0000-4000-8000-000000000002'), 'CUSTOMER', 900000202, 'Ярина Каналова', 'TEXT',
   'E2E: коли відправляєте?', NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 3 DAY),
  (UUID_TO_BIN('e2e05001-0000-4000-8000-000000000002'), 'ADMIN', 1, 'Bootstrap admin', 'TEXT',
   'E2E: відправляємо щодня', NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 2 DAY);
