SELECT REPLACE(LEFT(text,400),'\n',' | ') FROM order_messages
WHERE sender_type='SYSTEM' AND text LIKE '%ОТКЛОНЕНО%' AND text LIKE '%ричин%'
LIMIT 3;
