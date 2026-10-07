-- ============================================================
--  The two seeded payment options (V2) described the old manual flow ("на счёт ФОП",
--  "на карту по реквизитам"). Both are paid online through monobank now, so their
--  texts — Russian source and uk/en translations — are replaced. source_hash is the
--  SHA-256 of the new Russian text, so the translations do not show up as stale.
-- ============================================================

UPDATE payment_options
   SET title = 'Предоплата 100 грн онлайн',
       description = '100 грн картой онлайн сейчас (бронь товара и страховка доставки, вычитается из суммы), остальное — при получении на Новой почте.'
 WHERE id = UNHEX('11111111111111111111111111111111');

UPDATE payment_options
   SET title = 'Полная оплата онлайн',
       description = 'Вся сумма картой онлайн: Visa/Mastercard, Apple Pay, Google Pay.'
 WHERE id = UNHEX('22222222222222222222222222222222');

-- Upsert the translations of whatever source text the rows now hold (only rows that exist).
INSERT INTO content_translations (entity_type, entity_id, field, locale, text, source_hash, origin)
SELECT 'PAYMENT_OPTION', p.id, t.field, t.locale, t.text,
       SHA2(CASE t.field WHEN 'title' THEN p.title ELSE p.description END, 256), 'MANUAL'
  FROM payment_options p
  JOIN (
        SELECT '11111111111111111111111111111111' AS hid, 'title' AS field, 'uk' AS locale,
               'Передоплата 100 грн онлайн' AS text
        UNION ALL SELECT '11111111111111111111111111111111', 'description', 'uk',
               '100 грн карткою онлайн зараз (бронювання товару й страхування доставки, віднімається від суми), решта — при отриманні на Новій пошті.'
        UNION ALL SELECT '11111111111111111111111111111111', 'title', 'en', '100 UAH prepayment online'
        UNION ALL SELECT '11111111111111111111111111111111', 'description', 'en',
               'Pay 100 UAH by card now (reserves the item and insures delivery, deducted from the total), the rest on delivery at Nova Poshta.'
        UNION ALL SELECT '22222222222222222222222222222222', 'title', 'uk', 'Повна оплата онлайн'
        UNION ALL SELECT '22222222222222222222222222222222', 'description', 'uk',
               'Уся сума карткою онлайн: Visa/Mastercard, Apple Pay, Google Pay.'
        UNION ALL SELECT '22222222222222222222222222222222', 'title', 'en', 'Full payment online'
        UNION ALL SELECT '22222222222222222222222222222222', 'description', 'en',
               'The whole amount by card online: Visa/Mastercard, Apple Pay, Google Pay.'
       ) t ON p.id = UNHEX(t.hid)
 WHERE (t.field = 'title' AND p.title IS NOT NULL) OR (t.field = 'description' AND p.description IS NOT NULL)
ON DUPLICATE KEY UPDATE text = VALUES(text), source_hash = VALUES(source_hash), origin = 'MANUAL';
