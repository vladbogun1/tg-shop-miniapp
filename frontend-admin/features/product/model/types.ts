/**
 * Товар в админке: ответ API (`Schemas["AdminProductDto"]`), приведённый к виду экрана, и тело записи.
 * Вид экрана совместим с витринным `Product` (`@shop/core/types`): им пользуются выбор товара, заказы, предзаказы,
 * где `null` из JSON означает «нет» (`undefined`). Преобразование — `fromAdminProductDto` (model/from-dto.ts).
 */
import type { Schemas } from "@shop/core/api/schemas";
import type { CardStatus, ProductCondition, ProductSpecs } from "@shop/core/catalog";
import type { Product } from "@shop/core/types";
import type { CardMeta } from "@/features/catalog";

export type AdminProductDto = Schemas["AdminProductDto"];

/** Что отбросил валидатор характеристик при сохранении (неизвестный ключ, опции нет в списке, плохое число…). */
export type SpecIssue = Schemas["Issue"];

/**
 * Товар, как его видит админка: общая форма витрины + поля сайта (адрес, «старая» цена, SEO) и карточки
 * каталога v2 (docs/CATALOG-SPECS.md §3.3).
 */
export type AdminProduct = Product & {
  slug?: string | null;
  compareAtMinor?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** Артикул (уникальный, если задан); null — сайт использует id. */
  sku?: string | null;
  /** Поток карточки (на витрине не виден): DRAFT → AI_FILLED → READY. */
  cardStatus?: CardStatus;
  /** Общая уверенность ИИ последнего импорта, 0..100. */
  cardConfidence?: number | null;
  cardMeta?: CardMeta | null;
  /** Обязательные характеристики без значения, как их посчитал бэкенд. */
  missingRequired?: string[] | null;
  /** V53: создан короткой формой и ещё не опубликован/архивирован («Незавершён»). */
  unfinished?: boolean;
};

/** Ответ на сохранение: то же + что отбросил валидатор (приходит только в ответе на запись). */
export type AdminProductSaved = AdminProduct & { specIssues?: SpecIssue[] | null };

/** Тело создания/правки товара (`ProductUpsertRequest`), строже сгенерированного: перечисления и характеристики. */
export interface ProductWriteRequest {
  title: string;
  description?: string;
  priceMinor: number;
  currency: string;
  /** Не задан — сохранить остаток как есть (админ его не трогал; заказы могли его сдвинуть). */
  stock?: number;
  /** Остаток на момент открытия формы; изменённый `stock` поверх сдвинутого значения → 409 STOCK_CONFLICT. */
  expectedStock?: number;
  /** Обязателен, если `stock` или остаток варианта уменьшается: DEFECT | INVENTORY | MISSORT | SOLD_OFFLINE | OTHER. */
  stockReason?: string;
  /** Текст списания; обязателен для OTHER. */
  stockNote?: string;
  active: boolean;
  imageKeys: string[];
  /** Листовая категория; для нового товара обязательна. null — оставить, "" — убрать. */
  categoryId?: string | null;
  /** Существующий бренд; "" — снять, null — оставить. Без brandId, но с brandName — найти или создать по названию/псевдониму. */
  brandId?: string | null;
  brandName?: string;
  condition?: ProductCondition;
  /** "" — очистить. */
  conditionNote?: string;
  /** Весь объект характеристик (нет ключа = неизвестно). */
  specs?: ProductSpecs;
  cardStatus?: CardStatus;
  /**
   * Существующие варианты ОБЯЗАНЫ нести id: без него сервер сопоставит только по названию, и переименование
   * удалило бы строку и создало новую — а это ломало сохранённые корзины и ссылки в прошлых заказах.
   */
  variants: { id?: string; name: string; stock?: number; expectedStock?: number }[];
  /** Публичный сайт. Пустой slug — сгенерировать из названия; не заданные поля остаются как были. */
  slug?: string;
  /** «Старая цена» (в копейках); 0 — убрать. */
  compareAtMinor?: number;
  seoTitle?: string;
  seoDescription?: string;
  /** Уникальный среди товаров; "" — очистить; не задан — оставить. Занятый → 400. */
  sku?: string;
}
