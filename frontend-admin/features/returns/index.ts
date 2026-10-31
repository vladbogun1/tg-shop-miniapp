/** Публичный контракт фичи «Возвраты и обмен»: окна, блоки карточки заказа, API и хуки записи. */
export { ReturnModal } from "./ui/return/ReturnModal";
export { ReturnReceivedModal } from "./ui/ReturnReceivedModal";
export { ReturnHistoryBlock } from "./ui/history/ReturnHistoryBlock";
export { ReturnBadge } from "./ui/ReturnBadge";
export { ExchangeModal } from "./ui/exchange/ExchangeModal";
export { MoneyLedgerBlock } from "./ui/ledger/MoneyLedgerBlock";
export { RestoreWriteoffModal } from "./ui/RestoreWriteoffModal";
/** Карточка выбора и счётчик — их используют и окна других фич (объединение заказов). */
export { ChoiceCard, Counter } from "./ui/parts";

export { returnsApi, MONO_REFUND_FAILED_CODE } from "./api";
export type {
  ReturnWizardBody,
  ReturnReceivedBody,
  ExchangeBody,
  ReturnOutcome,
  ExchangeOutcome,
  CancelMoney,
} from "./api";
export { returnsKeys } from "./keys";
export {
  useRegisterReturn,
  useReceiveReturn,
  useExchange,
  useCancelReturn,
  useReturnDebtPaid,
  useRestoreWriteoff,
} from "./queries";
export type {
  ReturnLineOutcome,
  ReturnStatus,
  ReturnRecord,
  ReturnRecordLine,
  OrderExchange,
  OrderMovement,
  OrderWriteoff,
} from "./model/types";
