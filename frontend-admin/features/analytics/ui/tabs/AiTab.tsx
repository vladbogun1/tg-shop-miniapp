"use client";

/**
 * «Метрики → ИИ» (право «Финансы»): расход, доля встроенного ИИ, принято без правок, зря потрачено, ждёт проверки.
 * Период — тот же, что на других вкладках; сервер принимает даты, поэтому токен переводим здесь. Канал не учитывается.
 */
import { AiMetrics } from "@/features/ai";
import { periodRange } from "../../model/period";
import type { PeriodParams } from "../../model/types";
import { Note } from "../kit";

export function AiTab({ params }: { params: PeriodParams }) {
  const { from, to } = periodRange(params);
  return (
    <div className="flex flex-col gap-4">
      <AiMetrics from={from} to={to} />
      <Note>Период — календарные дни по Киеву. Тестовые запуски технического админа в цифры не входят; канал здесь не учитывается.</Note>
    </div>
  );
}
