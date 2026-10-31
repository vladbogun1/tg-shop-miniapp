import type { PeriodParams } from "./model/types";

/**
 * Ключи кэша фичи. Корень `metrics2` сбрасывается из карточки заказа (заказ изменился — цифры устарели);
 * «Предзаказы» и «Маржа» лежат под корнями `preorders` и `costing`, чтобы их сбрасывали и записи в тех модулях.
 */
export const analyticsKeys = {
  root: () => ["metrics2"] as const,
  today: () => ["metrics2", "today"] as const,
  overview: (p: PeriodParams) => ["metrics2", "overview", p] as const,
  forecast: (channel: string) => ["metrics2", "forecast", channel] as const,
  returns: (p: PeriodParams) => ["metrics2", "returns", p] as const,
  /** Корень вкладки «Товары и склад»: «Скрыть» в таблице сбрасывает все её комбинации. */
  stockRoot: () => ["metrics2", "stock"] as const,
  stock: (p: PeriodParams, deadDays: number, coverDays: number) => ["metrics2", "stock", p, deadDays, coverDays] as const,
  customers: (p: PeriodParams) => ["metrics2", "customers", p] as const,
  funnel: (p: PeriodParams) => ["metrics2", "funnel", p] as const,
  operations: (p: PeriodParams) => ["metrics2", "operations", p] as const,
  preorders: (from: string, to: string) => ["preorders", "metrics", from, to] as const,
  margin: (p: PeriodParams) => ["costing", "report", p.period, p.from, p.to] as const,
};
