/** Вид экрана заказов: доска или таблица. Без React. */
export type OrdersView = "board" | "table";

export const VIEW_OPTIONS: { value: OrdersView; label: string }[] = [
  { value: "board", label: "Доска" },
  { value: "table", label: "Таблица" },
];
