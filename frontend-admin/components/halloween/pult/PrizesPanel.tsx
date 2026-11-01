"use client";

/**
 * «Призы» tab of the remote: which pack each round of each draw plays for, the packs themselves
 * (shared by both draws) and the message template for the winners.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { hwDraw, type HwPool, type HwPrize } from "@/lib/halloween-api";
import { useToast } from "@/lib/toast";
import { PrizePhoto } from "./PrizePhoto";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Skeleton } from "@/components/ui/Skeleton";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { POOL_TITLE, usePoolData } from "./PoolColumn";
import { PrizeModal } from "./PrizeModal";

const NONE = "none";

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["hw-pult"] });
}

function RoundsTable({ pool }: { pool: HwPool }) {
  const { push } = useToast();
  const refresh = useRefresh();
  const { screen, prizes } = usePoolData(pool, false);
  if (!screen.data || !prizes.data) return <Skeleton className="h-[420px]" />;
  const pz = prizes.data;
  const options = [{ value: NONE, label: "— без приза —" }, ...pz.prizes.map((p) => ({ value: String(p.id), label: p.name }))];
  return (
    <div className="panel flex flex-col gap-2 p-4">
      <h3 className="section-title">{POOL_TITLE[pool]}</h3>
      {Array.from({ length: screen.data.rounds }, (_, i) => i + 1).map((round) => (
        <div key={round} className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3">
          <span className="text-[13px] text-[var(--text-muted)]">Раунд {round}</span>
          <Select<string> value={pz.rounds[round] ? String(pz.rounds[round]) : NONE} options={options}
            onChange={(v) => hwDraw.assign(pool, round, v === NONE ? null : Number(v)).then(refresh, (e: unknown) => push(e instanceof Error ? e.message : "Не получилось", "error"))} />
        </div>
      ))}
    </div>
  );
}

function PackCard({ p, onEdit, onDelete }: { p: HwPrize; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="card flex gap-3 p-3">
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[var(--r-md)] bg-[var(--surface-2)]">
        {p.images[0] && <PrizePhoto imageKey={p.images[0]} size={128} className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[14px] font-bold leading-tight">{p.name}</p>
        <p className="mt-1 line-clamp-2 text-[12px] text-[var(--text-muted)]">{p.items.join(" · ") || "состав не указан"}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <Button size="icon" variant="ghost" aria-label="Изменить" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Удалить" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function TemplateCard() {
  const { push } = useToast();
  const { prizes } = usePoolData("pumpkins", false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const saved = prizes.data?.template ?? "";
  useEffect(() => setText(saved), [saved]);
  async function save() {
    setBusy(true);
    try {
      await hwDraw.setTemplate(text);
      push("Шаблон сохранён", "ok");
    } catch (e) {
      push(e instanceof Error ? e.message : "Не получилось", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <h3 className="section-title">Сообщение победителю</h3>
      <p className="text-[12px] text-[var(--text-muted)]">Подстановки: {"{name}"} — имя, {"{draw}"} — розыгрыш, {"{round}"} — раунд, {"{prize}"} — приз, {"{items}"} — что внутри, {"{deadline}"} — до скольки ждём ответ (по Киеву), {"{minutes}"} — сколько минут. Без {"{deadline}"} строка про срок добавится сама. Пустой — шаблон по умолчанию.</p>
      <Textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} />
      <div><Button variant="accent" loading={busy} disabled={text === saved} onClick={save}>Сохранить шаблон</Button></div>
    </div>
  );
}

export function PrizesPanel() {
  const { push } = useToast();
  const refresh = useRefresh();
  const [confirm, confirmNode] = useConfirm();
  const [edit, setEdit] = useState<HwPrize | "new" | null>(null);
  const { prizes } = usePoolData("pumpkins", false);

  async function remove(p: HwPrize) {
    if (!(await confirm({ title: `Удалить «${p.name}»?`, message: "Раунды с этим призом останутся без приза.", confirmLabel: "Удалить", danger: true }))) return;
    await hwDraw.deletePrize(p.id).then(refresh, (e: unknown) => push(e instanceof Error ? e.message : "Не получилось", "error"));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 xl:grid-cols-2">
        <RoundsTable pool="pumpkins" />
        <RoundsTable pool="orders" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="section-title">Наборы призов</h3>
          <Button variant="surface" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>Новый приз</Button>
        </div>
        {!prizes.data ? <Skeleton className="h-[240px]" /> : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {prizes.data.prizes.map((p) => <PackCard key={p.id} p={p} onEdit={() => setEdit(p)} onDelete={() => void remove(p)} />)}
          </div>
        )}
      </div>
      <TemplateCard />
      {edit && <PrizeModal prize={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void refresh(); }} />}
      {confirmNode}
    </div>
  );
}
