-- Умолчания веса и коробки по категориям для «Новой почты» (аудит отправок 2026-10, §5,
-- docs/np-shipments-audit-2026-10.md). Вес в граммах, стороны в мм — товар в своей упаковке.
-- Ставятся только там, где в категории ничего не задано: правки владельца не перетираются.
-- Для демо; на прод — тем же файлом после проверки.
--
-- Откат: UPDATE categories SET weight_g = NULL, length_mm = NULL, width_mm = NULL, height_mm = NULL
--        WHERE slug IN (<slug-и ниже>);  -- только если до заливки там было пусто

UPDATE categories c
JOIN (
              SELECT 'glaydy' slug, 30 w, 120 l, 80 wd, 10 h
    UNION ALL SELECT 'rukava', 30, 150, 100, 10
    UNION ALL SELECT 'kabelya', 100, 150, 100, 30
    UNION ALL SELECT 'keykapy', 400, 300, 150, 40
    UNION ALL SELECT 'klaviatury', 1300, 380, 150, 50
    UNION ALL SELECT 'klv-magnitnye', 1300, 380, 150, 50
    UNION ALL SELECT 'klv-mekhanicheskie', 1300, 380, 150, 50
    UNION ALL SELECT 'gravirovka', 1300, 380, 150, 50
    UNION ALL SELECT 'kovriki', 500, 380, 280, 40
    UNION ALL SELECT 'kovriki-tkanevye', 500, 380, 280, 40
    -- В таблице §5 — 900 г, 520×380×60; в CSV-матрице — 1800 г, 530×460×30. Взята таблица.
    UNION ALL SELECT 'steklyannyy-pad', 900, 520, 380, 60
    UNION ALL SELECT 'myshki', 350, 190, 130, 80
    UNION ALL SELECT 'naushniki', 800, 230, 200, 95
    UNION ALL SELECT 'naushniki-polnorazmernye', 800, 230, 200, 95
    UNION ALL SELECT 'naushniki-iem', 250, 150, 100, 60
    UNION ALL SELECT 'raznoe', 400, 150, 100, 80
    UNION ALL SELECT 'duyki', 400, 150, 100, 80
    UNION ALL SELECT 'zvukovye-karty', 300, 150, 100, 60
    UNION ALL SELECT 'mebel', 20000, 700, 600, 350
    UNION ALL SELECT 'kresla', 20000, 700, 600, 350
    UNION ALL SELECT 'stoly', 30000, 1200, 600, 150
) d ON d.slug = c.slug
SET c.weight_g = d.w, c.length_mm = d.l, c.width_mm = d.wd, c.height_mm = d.h
WHERE c.weight_g IS NULL AND c.length_mm IS NULL AND c.width_mm IS NULL AND c.height_mm IS NULL;
