"use client";

/**
 * Halloween broadcast (events/halloween broadcast.js): progress of the running one, a test to yourself and
 * the two starts. A start goes to real people, so it asks for the number of recipients typed in.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, FlaskConical } from "lucide-react";
import { hwApi, type HwBroadcastStatus, type HwJob, type HwMembers } from "@/lib/halloween-api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/lib/toast";

type Campaign = "old" | "rest";
const WHO: Record<Campaign, string> = { old: "Постоянным покупателям", rest: "Всем остальным" };

export function BroadcastPanel({ members }: { members: HwMembers | undefined }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [ask, setAsk] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: st } = useQuery({
    queryKey: ["hw-broadcast"],
    queryFn: hwApi.broadcastStatus,
    refetchInterval: (q) => (q.state.data?.job && !q.state.data.job.finishedAt ? 3000 : 30_000),
  });
  const running = Boolean(st?.job && !st.job.finishedAt);

  async function test() {
    setBusy(true);
    try {
      const r = await hwApi.broadcastTest();
      push(`Отправлено вам (${r.lang}): постоянным — ${r.result.old}, остальным — ${r.result.rest}`, "ok");
    } catch (e) {
      push(e instanceof Error ? e.message : "Не получилось", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="section-title flex items-center gap-2">
          <span aria-hidden className="h-3.5 w-[2px] rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]" />
          Рассылка ботом
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="surface" size="sm" icon={<FlaskConical className="h-4 w-4" />} loading={busy} onClick={test}>
            Тест себе
          </Button>
          {(["old", "rest"] as const).map((c) => (
            <Button key={c} variant="outline" size="sm" icon={<Send className="h-4 w-4" />} disabled={!st || running || !st.left[c] || !st.botToken}
              onClick={() => setAsk(c)}>
              {WHO[c]}: {st?.left[c] ?? "…"}
            </Button>
          ))}
        </div>
      </div>
      {st?.job && <JobLine job={st.job} />}
      <Totals st={st} members={members} />
      <StartModal campaign={ask} left={ask && st ? st.left[ask] : 0} onClose={() => setAsk(null)}
        onStarted={() => { setAsk(null); void qc.invalidateQueries({ queryKey: ["hw-broadcast"] }); }} />
    </div>
  );
}

function JobLine({ job }: { job: HwJob }) {
  const done = Boolean(job.finishedAt);
  const share = job.total ? Math.round((job.done / job.total) * 100) : 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone={done ? "ok" : "accent"} dot>{done ? "завершена" : "идёт"}</Badge>
        <span className="font-semibold text-[var(--text)]">{WHO[job.campaign]}</span>
        <span className="tabular text-[var(--text-muted)]">
          {job.done} из {job.total} · доставлено {job.ok} · заблокировали {job.blocked} · ошибки {job.error}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

function Totals({ st, members }: { st: HwBroadcastStatus | undefined; members: HwMembers | undefined }) {
  return (
    <div className="grid gap-2 text-[13px] text-[var(--text-muted)] sm:grid-cols-2">
      {members && <Audience members={members} />}
      {st && !st.botToken && <div className="text-[var(--danger-ink)]">Нет токена бота, рассылка невозможна.</div>}
      {st && st.only > 0 && <div>Ограничение стенда: шлёт только {st.only} тестовым id.</div>}
    </div>
  );
}

function Audience({ members: { summary: s, rules, rest } }: { members: HwMembers }) {
  return (
    <>
      <div>
        Постоянные (от {Math.round(rules.oldMinSpendMinor / 100)} ₴ до акции): {s.oldTotal},
        участвуют <b className="text-[var(--text)]">{s.oldJoined}</b>, не нажали {s.oldGrey}
      </div>
      <div>
        Остальным: доставлено {rest.sent}, заблокировали {rest.blocked}, ошибки {rest.error}
      </div>
    </>
  );
}

function StartModal({ campaign, left, onClose, onStarted }: { campaign: Campaign | null; left: number; onClose: () => void; onStarted: () => void }) {
  const { push } = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  async function start() {
    if (!campaign) return;
    setBusy(true);
    try {
      await hwApi.broadcastStart(campaign, Number(typed));
      push("Рассылка запущена", "ok");
      setTyped("");
      onStarted();
    } catch (e) {
      push(e instanceof Error ? e.message : "Не получилось", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={campaign !== null} onClose={onClose} size="sm" title={campaign ? `${WHO[campaign]}: ${left}` : ""} closeOnBackdrop={false}
      footer={<><ModalCancel disabled={busy} /><Button variant="accent" loading={busy} disabled={Number(typed) !== left} onClick={start}>Разослать</Button></>}>
      <p className="mb-3 text-[14px] text-[var(--text-muted)]">
        Сообщения уйдут настоящим людям, каждому один раз. Чтобы подтвердить, введите число получателей: <b className="text-[var(--text)]">{left}</b>.
      </p>
      <Input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} placeholder={String(left)} />
    </Modal>
  );
}
