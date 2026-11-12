"use client";

/**
 * «Отправитель Новой Почты»: контрагент и контакт из кабинета, телефон, отделения отправки (Харьков №65 / №104).
 * «Загрузить из кабинета НП» заполняет контрагента и контакты, «Проверить ключ» — один авторизованный вызов.
 * Ниже — коробки (настройка «Коробки» на вкладке «Коробки и вес») только для чтения.
 */
import { useState } from "react";
import { CircleCheck, CircleX, Download, KeyRound, Save, Warehouse } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { formatDateTime } from "@shop/core/time";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { QueryState } from "@/components/ui/QueryState";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import type { KeyCheck, SenderConfig } from "../../model/types";
import { useCheckKey, useLoadSender, useSaveSender, useSenderQuery } from "../../queries";
import { BoxPresetsList } from "./BoxPresetsList";
import { SenderBranches } from "./SenderBranches";

export function NpSenderPanel({ title }: { title: string }) {
  const q = useSenderQuery();
  const load = useLoadSender();
  const check = useCheckKey();
  return (
    <div className="min-w-0">
      <PanelHeader icon={Warehouse} title={title} description="Кабинет, контакт и отделения, откуда вы отправляете посылки." />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={q.data?.keyConfigured ? "ok" : "danger"}>{q.data?.keyConfigured ? "Ключ API задан" : "Ключ API не задан"}</Badge>
            {q.data?.dryRun && <Badge tone="warn">Тестовый режим — ТТН не уходят в НП</Badge>}
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button size="sm" variant="surface" loading={check.isPending} icon={<KeyRound className="h-4 w-4" />} onClick={() => check.mutate()}>
                Проверить ключ
              </Button>
              <Button size="sm" variant="surface" loading={load.isPending} icon={<Download className="h-4 w-4" />} onClick={() => load.mutate()}>
                Загрузить из кабинета НП
              </Button>
            </div>
          </div>
          {check.data && <KeyResult check={check.data} />}
          {q.data?.sender ? (
            // key: свежая копия с сервера (загрузка из кабинета, сохранение) заново заполняет форму.
            <SenderForm key={JSON.stringify(q.data.sender)} saved={q.data.sender} />
          ) : (
            <p className="text-[13px] text-[var(--text-muted)]">
              Отправитель ещё не загружен. Нажмите «Загрузить из кабинета НП» — подтянутся контрагент и контактные лица.
            </p>
          )}
          <BoxPresetsList />
        </div>
      </QueryState>
    </div>
  );
}

function KeyResult({ check }: { check: KeyCheck }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 break-words rounded-[var(--r-md)] border px-3 py-2.5 text-[13px]",
        check.ok
          ? "border-[color-mix(in_srgb,var(--ok)_40%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]"
          : "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
      )}
    >
      {check.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ok)]" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />}
      <span className="min-w-0">
        {check.ok ? "Ключ принят" : "Ключ не работает"}
        {check.counterpartyName ? ` · ${check.counterpartyName}` : ""}
        {check.message ? ` — ${check.message}` : ""}
      </span>
    </p>
  );
}

function SenderForm({ saved }: { saved: SenderConfig }) {
  const [draft, setDraft] = useState<SenderConfig>(saved);
  const save = useSaveSender();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const patch = (p: Partial<SenderConfig>) => setDraft((d) => ({ ...d, ...p }));
  const pickContact = (ref: string) => {
    const c = draft.contacts.find((x) => x.ref === ref);
    patch({ contactRef: ref, contactName: c?.name ?? draft.contactName, phone: c?.phone || draft.phone });
  };
  return (
    <>
      <div className="card-2 min-w-0 rounded-[var(--r-md)] px-3.5 py-3 text-[13px]">
        <div className="break-words font-semibold text-[var(--text)]">{draft.counterpartyName}</div>
        <div className="text-[12px] text-[var(--text-faint)]">
          {draft.ownershipForm === "PrivatePerson" ? "ФОП" : (draft.ownershipForm ?? "")}
          {draft.loadedAt ? ` · загружено ${formatDateTime(draft.loadedAt)}` : ""}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {draft.contacts.length > 0 ? (
          <Select
            label="Контактное лицо"
            value={draft.contactRef}
            options={draft.contacts.map((c) => ({ value: c.ref, label: c.name }))}
            onChange={pickContact}
          />
        ) : (
          <Input label="Контактное лицо" value={draft.contactName ?? ""} readOnly />
        )}
        <Input label="Телефон отправителя" inputMode="tel" value={draft.phone} onChange={(e) => patch({ phone: e.target.value })} />
      </div>
      <SenderBranches cfg={draft} onChange={setDraft} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && <span className="text-[12px] font-semibold text-[var(--accent-hi)]">Не сохранено</span>}
        <Button
          variant="accent"
          className="max-sm:w-full"
          loading={save.isPending}
          disabled={!dirty}
          icon={<Save className="h-4 w-4" />}
          onClick={() => save.mutate(draft)}
        >
          Сохранить отправителя
        </Button>
      </div>
    </>
  );
}
