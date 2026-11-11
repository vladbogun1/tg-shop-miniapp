"use client";

/**
 * «Миттєві статуси (вебхуки)»: Новая Почта сама сообщает серверу о смене статуса. Опрос раз в 30 минут остаётся.
 * Адрес и секрет — в .env сервера и в браузер не попадают; ИНН подписок видно только тремя последними цифрами.
 */
import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { QueryState } from "@/components/ui/QueryState";
import { maskTin } from "../../model/format";
import type { WebhookStatus, WebhookSubscription } from "../../model/types";
import { useSubscribeWebhook, useUnsubscribeWebhook, useWebhookQuery } from "../../queries";
import { Notice } from "../parts";

export function NpWebhookPanel({ title }: { title: string }) {
  const q = useWebhookQuery();
  return (
    <div className="min-w-0">
      <PanelHeader icon={Zap} title={title} description="Новая Почта сама сообщает серверу о смене статуса посылки." />
      <p className="mb-3 text-[12.5px] leading-snug text-[var(--text-muted)]">Опрос раз в 30 минут остаётся — вебхуки только ускоряют приход статусов.</p>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
        {q.data && <WebhookBody s={q.data} />}
      </QueryState>
    </div>
  );
}

function WebhookBody({ s }: { s: WebhookStatus }) {
  // Отсюда удаляется только подписка на адрес этого сервера.
  const ours = (x: WebhookSubscription) => !!s.url && x.url === s.url;
  const hasOurs = s.subscriptions.some((x) => ours(x) && x.active);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={s.configured ? "ok" : "warn"}>{s.configured ? "Настроено на сервере" : "Не настроено"}</Badge>
        {hasOurs && <Badge tone="ok">Подписка активна</Badge>}
      </div>
      {!s.configured && (
        <Notice tone="warn">
          На сервере нужно задать <span className="font-mono">NOVAPOSHTA_WEBHOOK_URL</span> (https-адрес) и{" "}
          <span className="font-mono">NOVAPOSHTA_WEBHOOK_SECRET</span> (латиница и цифры, от 16 символов) в .env и перезапустить бэкенд.
        </Notice>
      )}
      {s.url && (
        <div className="min-w-0 text-[13px]">
          <span className="field-label !text-[11px] !text-[var(--text-faint)]">Адрес для НП</span>
          <div className="break-all font-mono text-[12.5px] text-[var(--text)]">{s.url}</div>
        </div>
      )}
      {s.error && <p className="break-words text-[12.5px] text-[var(--danger-ink)]">{s.error}</p>}
      {s.subscriptions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {s.subscriptions.map((x) => (
            <SubscriptionRow key={x.id} x={x} ours={ours(x)} />
          ))}
        </ul>
      ) : (
        !s.error && <p className="text-[13px] text-[var(--text-muted)]">Подписок пока нет.</p>
      )}
      {s.configured && !hasOurs && <SubscribeForm />}
    </div>
  );
}

function SubscriptionRow({ x, ours }: { x: WebhookSubscription; ours: boolean }) {
  const confirm = useConfirm();
  const remove = useUnsubscribeWebhook();
  const ask = async () => {
    const ok = await confirm({
      title: "Удалить подписку?",
      message: "Новая Почта перестанет присылать статусы сразу. Опрос раз в 30 минут продолжит работать.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) remove.mutate(x.id);
  };
  return (
    <li className="card-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-md)] px-3 py-2.5">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <Badge tone={x.active ? "ok" : "neutral"}>{x.active ? "активна" : "выключена"}</Badge>
          {x.type && <span className="text-[var(--text-muted)]">{x.type}</span>}
          {ours && <Badge tone="accent">наша</Badge>}
        </div>
        {x.url && <div className="mt-1 break-all font-mono text-[12px] text-[var(--text-faint)]">{x.url}</div>}
        {(x.companyTins?.length ?? 0) > 0 && (
          <div className="text-[12px] text-[var(--text-faint)]">
            ЄДРПОУ/ІПН: <span className="tabular">{(x.companyTins ?? []).map(maskTin).join(", ")}</span>
          </div>
        )}
      </div>
      {ours && (
        <Button size="sm" variant="danger" loading={remove.isPending} onClick={ask}>
          Удалить
        </Button>
      )}
    </li>
  );
}

function SubscribeForm() {
  const [tin, setTin] = useState("");
  const subscribe = useSubscribeWebhook(() => setTin(""));
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 basis-56">
        <Input
          label="ЄДРПОУ / ІПН · необязательно"
          inputMode="numeric"
          autoComplete="off"
          type="password"
          value={tin}
          onChange={(e) => setTin(e.target.value.replace(/[^\d\s]/g, ""))}
          hint="Пусто — возьмём из кабинета отправителя"
        />
      </div>
      <Button variant="accent" className="max-sm:w-full" loading={subscribe.isPending} onClick={() => subscribe.mutate(tin.replace(/\s+/g, ""))}>
        Подписаться
      </Button>
    </div>
  );
}
