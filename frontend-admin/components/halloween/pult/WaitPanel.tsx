"use client";

/**
 * «Ждём ответа»: after the winner is on screen and Maxim wrote to them, the OBS scene counts down the
 * minutes typed here (stage-wait.js). The timer runs on the server clock, so every scene and this
 * remote show the same time; «Ответил» or «Убрать» end it, the next roll removes it too.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Plus, Timer, X } from "lucide-react";
import { hwDraw, type HwShow } from "@/lib/halloween-api";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { POOL_TITLE } from "./PoolColumn";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Milliseconds left on the server clock, ticking twice a second. */
function useLeft(show: HwShow) {
  const [now, setNow] = useState(() => Date.now());
  const skew = useRef(0); // server clock − ours, taken when a state arrives
  useEffect(() => {
    skew.current = show.now - Date.now();
  }, [show.now]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return show.wait ? show.wait.endsAt - (now + skew.current) : 0;
}

export function WaitPanel({ show, test, winnerName }: { show: HwShow; test: boolean; winnerName: (pool: string, id: string) => string | null }) {
  const { push } = useToast();
  const [minutes, setMinutes] = useState("3");
  const left = useLeft(show);
  const call = (b: Parameters<typeof hwDraw.wait>[0]) =>
    void hwDraw.wait(b).catch((e: unknown) => push(e instanceof Error ? e.message : "Не получилось", "error"));

  const w = show.wait?.test === test ? show.wait : null;
  if (w) {
    const who = winnerName(w.pool, w.winnerId) ?? "победитель";
    const state = w.answeredAt ? "ответил — на сцене «Відповів!»" : left > 0 ? `осталось ${mmss(left)}` : "время вышло — на сцене «Час вийшов»";
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
        <Timer className="h-4 w-4 text-[var(--accent-hi)]" />
        <span className="font-semibold">Отсчёт на сцене: {POOL_TITLE[w.pool]}, раунд {w.round}, {who} — {state}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {!w.answeredAt && (
            <>
              <Button size="sm" variant="surface" icon={<Plus className="h-4 w-4" />} onClick={() => call({ action: "add", minutes: 1 })}>1 мин</Button>
              <Button size="sm" variant="accent" icon={<Check className="h-4 w-4" />} onClick={() => call({ action: "answered" })}>Ответил</Button>
            </>
          )}
          <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => call({ action: "stop" })}>Убрать отсчёт</Button>
        </div>
      </div>
    );
  }

  const r = show.roll;
  if (!r?.revealedAt || r.test !== test) return null;
  const m = Number(minutes.replace(",", "."));
  const ok = m >= 0.5 && m <= 30;
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-3">
      <Input label="Сколько ждать ответа, мин" type="number" inputMode="decimal" min={0.5} max={30} step={0.5} value={minutes}
        onChange={(e) => setMinutes(e.target.value)} className="w-[110px]" />
      <Button variant="accent" icon={<Timer className="h-4 w-4" />} disabled={!ok}
        onClick={() => call({ action: "start", minutes: m })}>
        Отсчёт на сцене: {winnerName(r.pool, r.winnerId) ?? "победитель"}, раунд {r.round}
      </Button>
      <span className="pb-2 text-[12px] text-[var(--text-muted)]">Сначала «Написать» победителю, потом отсчёт. Новый розыгрыш или «Экран паузы» его уберут.</span>
    </div>
  );
}
