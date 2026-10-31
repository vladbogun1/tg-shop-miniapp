-- Откат:
--   ALTER TABLE nova_poshta_warehouses DROP INDEX idx_np_wh_coords;
--
-- Поиск отделений в рамке карты (NovaPoshtaWarehouseRepository.findInBox):
-- where lat between … and lng between … — без индекса полный скан ~56 тыс. строк.
ALTER TABLE nova_poshta_warehouses ADD INDEX idx_np_wh_coords (lat, lng);
