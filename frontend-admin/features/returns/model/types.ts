import type { Schemas } from "@shop/core/api/schemas";

/** Заказ у админа со всем, что нужно мастерам возврата и обмена. */
export type ReturnOrder = Schemas["OrderDetailDto"];
export type ReturnOrderItem = ReturnOrder["items"][number];

export type ReturnStatus = "IN_TRANSIT" | "RECEIVED";
export type ReturnLineOutcome = "RESTOCK" | "DEFECT" | "KEPT" | "IN_TRANSIT";

/** Где лежит возвращаемый товар сейчас. */
export type ReturnWhere = "POST" | "HERE" | "KEPT";
export type GiftChoice = "TAKE" | "LEAVE";

/** Одна запись возврата / обмена; отменить можно только самую новую активную. */
export type ReturnRecord = Schemas["ReturnRecordDto"];
export type ReturnRecordLine = Schemas["ReturnRecordLineDto"];
/** Одна строка журнала денег заказа. */
export type OrderMovement = Schemas["MovementDto"];
export type OrderWriteoff = Schemas["WriteoffDto"];
/** Один обмен (V51): что вернулось, что ушло взамен, ТТН и сумма до. */
export type OrderExchange = Schemas["ExchangeDto"];
