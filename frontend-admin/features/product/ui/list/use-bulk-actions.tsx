"use client";

/**
 * Массовые действия над выбранными товарами: «Показать», «Скрыть», «В архив».
 * «Показать» идёт по одному и БЕЗ force: карточку-черновик или товар без цены/категории сервер не пускает (409),
 * такие не выкладываются молча — собираются в отчёт, где «Выложить без оформления» — отдельное подтверждение.
 * Скрыть и в архив — с тостом «Отменить» на весь набор.
 */
import { ApiError, errorMessage } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useState } from "react";
import { productApi } from "../../api";
import type { AdminProduct } from "../../model/types";
import { missingOf } from "../PublishGate";

export interface PublishReport {
  shown: number;
  /** Карточка не оформлена: можно выложить принудительно или оформить с ИИ. */
  notReady: AdminProduct[];
  /** Не хватает цены/категории/фото: выложить нельзя. */
  blocked: { p: AdminProduct; why: string }[];
  failed: { p: AdminProduct; why: string }[];
}

/** По одному, ошибка одного не останавливает остальных. */
async function each(list: AdminProduct[], fn: (p: AdminProduct) => Promise<unknown>) {
  const ok: AdminProduct[] = [];
  const err: { p: AdminProduct; e: unknown }[] = [];
  for (const p of list) {
    try {
      await fn(p);
      ok.push(p);
    } catch (e) {
      err.push({ p, e });
    }
  }
  return { ok, err };
}

const nameOf = (list: AdminProduct[]) => (list.length === 1 ? `«${list[0].title}»` : `${list.length} товаров`);

export function useBulkActions(selected: AdminProduct[], done: () => void, refresh: () => void) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<PublishReport | null>(null);

  async function run(job: () => Promise<void>) {
    setBusy(true);
    try {
      await job();
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function setActiveAll(list: AdminProduct[], active: boolean) {
    await run(async () => void (await each(list, (p) => productApi.setActive(p.id, active, false))));
  }

  const show = () =>
    run(async () => {
      const { ok, err } = await each(selected, (p) => productApi.setActive(p.id, true, false));
      const r: PublishReport = { shown: ok.length, notReady: [], blocked: [], failed: [] };
      for (const { p, e } of err) {
        if (e instanceof ApiError && e.code === "CARD_NOT_READY") r.notReady.push(p);
        else if (e instanceof ApiError && e.code === "PRODUCT_NOT_PUBLISHABLE") {
          const m = missingOf(e.message);
          r.blocked.push({ p, why: m.length ? `не задана ${m.join(", ")}` : e.message });
        } else r.failed.push({ p, why: errorMessage(e, undefined, "Ошибка") });
      }
      done();
      if (r.notReady.length || r.blocked.length || r.failed.length) setReport(r);
      else toast.success(`На витрине: ${nameOf(ok)}`, { action: { label: "Отменить", onClick: () => void setActiveAll(ok, false) } });
    });

  /** Принудительный показ (после подтверждения в отчёте). */
  const forceShow = (list: AdminProduct[]) =>
    run(async () => {
      const { ok, err } = await each(list, (p) => productApi.setActive(p.id, true, true));
      setReport(null);
      if (ok.length) toast.success(`Выложено без оформления: ${nameOf(ok)}`);
      if (err.length) toast.error(`Не выложено: ${err.length}. ${errorMessage(err[0].e, undefined, "Ошибка")}`);
    });

  const hide = () =>
    run(async () => {
      const { ok, err } = await each(selected, (p) => productApi.setActive(p.id, false));
      done();
      if (ok.length) toast.success(`Скрыто: ${nameOf(ok)}`, { action: { label: "Отменить", onClick: () => void setActiveAll(ok, true) } });
      if (err.length) toast.error(`Не скрыто: ${err.length}`);
    });

  const archive = () =>
    run(async () => {
      const { ok, err } = await each(selected, (p) => productApi.setArchived(p.id, true));
      done();
      const back = () => run(async () => void (await each(ok, (p) => productApi.setArchived(p.id, false))));
      if (ok.length) toast.success(`В архиве: ${nameOf(ok)}`, { action: { label: "Отменить", onClick: () => void back() } });
      if (err.length) toast.error(`Не архивировано: ${err.length}`);
    });

  return { busy, show, hide, archive, forceShow, report, closeReport: () => setReport(null) };
}
