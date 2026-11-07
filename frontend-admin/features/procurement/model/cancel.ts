/** Отмена поставки: необязательная причина (как на бэкенде, BatchLimits.CANCEL_REASON_MAX). */
export const CANCEL_REASON_MAX = 500;

export interface CancelBatchInput {
  closeQueue: boolean;
  reason: string;
}

/** Тело запроса: пустая причина — не отправляем, остальное режем по пробелам. */
export function cancelBody(input: CancelBatchInput): { closeQueue: boolean; reason: string | null } {
  const reason = input.reason.trim();
  return { closeQueue: input.closeQueue, reason: reason === "" ? null : reason };
}

/** Причина слишком длинная (после обрезки пробелов). */
export function cancelReasonTooLong(reason: string): boolean {
  return reason.trim().length > CANCEL_REASON_MAX;
}
