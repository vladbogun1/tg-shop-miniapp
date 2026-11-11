-- Себестоимость по партиям (11.11.2026): у старого остатка и ручных партий закупку вписывают руками, отдельно
-- «закупка» и «доставка» за штуку. unit_cost_minor остаётся полной себестоимостью штуки (её читают маржа и отчёты),
-- unit_extra_minor — доставочная часть внутри неё (только для показа «закупка + доставка»); NULL = не разбита.
-- Только добавляет: старый бэкенд колонку не знает и не трогает, откат — образами (infra/rollback.sh).
-- Убрать при желании: ALTER TABLE stock_lots DROP COLUMN unit_extra_minor;
ALTER TABLE stock_lots ADD COLUMN unit_extra_minor BIGINT NULL AFTER unit_cost_minor;
