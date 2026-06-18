-- ============================================================
--  Сид: варианты оплаты, реквизиты, первые админы.
--  (UUID -> BINARY(16) через UUID_TO_BIN с swap-флагом 0,
--   совместимо с UuidUtil: MSB первым.)
-- ============================================================

INSERT INTO payment_options (id, title, description, requires_prepayment, prepayment_minor, sort_order, active) VALUES
  (UUID_TO_BIN('11111111-1111-1111-1111-111111111111'),
   'Передоплата 100 грн',
   'Бронь товара + бесплатная доставка. Доплата при получении.',
   TRUE, 10000, 1, TRUE),
  (UUID_TO_BIN('22222222-2222-2222-2222-222222222222'),
   'Полная оплата на карту',
   'Оплата всей суммы заказа на карту по реквизитам.',
   FALSE, 0, 2, TRUE);

INSERT INTO payment_requisites (id, card_number, iban, recipient, edrpou, purpose, note) VALUES
  (1,
   '4246001040134680',
   'UA663052990000026005025918119',
   'Богун Богдан Богданович',
   '3547612413',
   'Оплата за товар',
   'Реквизиты для оплаты. После оплаты пришлите квитанцию в чат заказа.');

-- Первые админы (со старого прод-конфига). Скорректируй при необходимости.
INSERT INTO admin_users (telegram_user_id, name, role, active) VALUES
  (593289478, 'admin', 'SUPER_ADMIN', TRUE),
  (977067472, 'admin', 'ADMIN', TRUE);
