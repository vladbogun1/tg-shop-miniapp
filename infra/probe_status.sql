SELECT 'ОДОБРЕНО' AS kw, COUNT(*) AS msgs, COUNT(DISTINCT order_id) AS orders
FROM order_messages WHERE sender_type='SYSTEM' AND text LIKE '%ОДОБРЕНО%'
UNION ALL
SELECT 'ВЫСЛАНО', COUNT(*), COUNT(DISTINCT order_id)
FROM order_messages WHERE sender_type='SYSTEM' AND text LIKE '%ВЫСЛАНО%'
UNION ALL
SELECT 'ОТПРАВЛЕН', COUNT(*), COUNT(DISTINCT order_id)
FROM order_messages WHERE sender_type='SYSTEM' AND text LIKE '%ОТПРАВЛЕН%'
UNION ALL
SELECT 'ДОСТАВЛЕНО', COUNT(*), COUNT(DISTINCT order_id)
FROM order_messages WHERE sender_type='SYSTEM' AND text LIKE '%ДОСТАВЛЕНО%'
UNION ALL
SELECT 'ОТКЛОНЕНО', COUNT(*), COUNT(DISTINCT order_id)
FROM order_messages WHERE sender_type='SYSTEM' AND text LIKE '%ОТКЛОНЕНО%'
UNION ALL
SELECT 'ОТМЕНЕН', COUNT(*), COUNT(DISTINCT order_id)
FROM order_messages WHERE sender_type='SYSTEM' AND text LIKE '%ОТМЕНЕН%';

-- distinct first bold headers (status labels) among SYSTEM messages
SELECT DISTINCT SUBSTRING_INDEX(SUBSTRING_INDEX(text, '</b>', 1), '<b>', -1) AS header, COUNT(*) c
FROM order_messages WHERE sender_type='SYSTEM' AND text LIKE '%<b>%'
GROUP BY header ORDER BY c DESC LIMIT 25;
