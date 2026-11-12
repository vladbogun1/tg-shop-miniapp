-- What the shop already declared before V99 (the text setting novaposhta.boxPresets on prod, 12.11.2026) carries over
-- into the box catalog, so a parcel is not suddenly declared differently on the day of the release:
--   * «Пакет НП» 550×500 — the bag the packers really use (the owner set it to 500×550×70 that day), in stock;
--     its thickness now comes from the goods, as for every bag (an XL pad: 1 cm, as NP accepted it);
--   * the tare of the boxes in stock as it was declared (heavier than the V99 estimate), unless already edited.
-- Data only; the old backend never reads np_boxes, and novaposhta.boxPresets stays as it was for a rollback.

INSERT INTO np_boxes (id, code, name, kind, length_mm, width_mm, heights_mm, tare_g, pack_minor, pack_estimated,
                      in_stock, sort_order)
SELECT UUID_TO_BIN(UUID()), NULL, 'Пакет НП', 'BAG', 550, 500, NULL, 50, 0, 0, 1, 165
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM np_boxes WHERE name = 'Пакет НП');

UPDATE np_boxes SET tare_g = 100 WHERE code = 'np-1' AND tare_g = 80;
UPDATE np_boxes SET tare_g = 200 WHERE code = 'np-2' AND tare_g = 120;
UPDATE np_boxes SET tare_g = 300 WHERE code = 'np-5' AND tare_g = 200;
UPDATE np_boxes SET tare_g = 600 WHERE code = 'np-10' AND tare_g = 350;
