"use client";

/**
 * The OBS scene panel of the remote: is a scene connected, what it shows now, the scene link,
 * blackout, the visual of ordinary rounds, avatars/sound and the rehearsal switch.
 */
import { Copy, ExternalLink, Moon, Sun } from "lucide-react";
import { HW_VISUALS, hwDraw, hwStageUrl, type HwShow, type HwVisual } from "@/lib/halloween-api";
import { HW_PLAY_WINDOW_MS } from "@/lib/use-hw-show";
import { useToast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { POOL_TITLE } from "./PoolColumn";

function NowLine({ show, test, winnerName }: { show: HwShow; test: boolean; winnerName: (pool: string, id: string) => string | null }) {
  const r = show.roll;
  if (!r || r.test !== test || Date.now() - r.at > HW_PLAY_WINDOW_MS) return null;
  const where = `${POOL_TITLE[r.pool]}, раунд ${r.round}`;
  return (
    <p className="font-display text-[16px] font-bold">
      {r.revealedAt ? `${where}: на экране ${winnerName(r.pool, r.winnerId) ?? "победитель"}` : `${where} крутится…`}
    </p>
  );
}

function SceneStatus({ show, online }: { show: HwShow | null; online: boolean }) {
  if (!online) return <Badge tone="danger" dot>Нет связи с сервером розыгрыша</Badge>;
  if (!show?.stages) return <Badge tone="warn" dot>Сцена OBS не подключена</Badge>;
  return <Badge tone="ok" dot>Сцена OBS подключена{show.stages > 1 ? ` (${show.stages})` : ""}</Badge>;
}

export function SceneBar({ show, online, stageKey, test, onTest, visual, onVisual, winnerName }: {
  show: HwShow | null;
  online: boolean;
  stageKey: string;
  test: boolean;
  onTest: (v: boolean) => void;
  visual: HwVisual;
  onVisual: (v: HwVisual) => void;
  winnerName: (pool: string, id: string) => string | null;
}) {
  const { push } = useToast();
  const url = stageKey ? hwStageUrl(stageKey) : "";
  const set = (patch: Parameters<typeof hwDraw.setShow>[0]) =>
    hwDraw.setShow(patch).catch((e: unknown) => push(e instanceof Error ? e.message : "Не получилось", "error"));

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SceneStatus show={show} online={online} />
        {test && <Badge tone="danger">Тест · участники ненастоящие</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="surface" icon={<ExternalLink className="h-4 w-4" />} disabled={!url} onClick={() => window.open(url, "hw-stage")}>Открыть сцену</Button>
          <Button size="sm" variant="surface" icon={<Copy className="h-4 w-4" />} disabled={!url}
            onClick={() => navigator.clipboard.writeText(url).then(() => push("Ссылка для OBS скопирована: Источник → Браузер, 1920×1080", "ok"))}>
            Ссылка для OBS
          </Button>
          {show?.blackout ? (
            <Button size="sm" variant="danger" icon={<Sun className="h-4 w-4" />} onClick={() => void set({ blackout: false })}>Показать сцену</Button>
          ) : (
            <Button size="sm" variant="outline" icon={<Moon className="h-4 w-4" />} onClick={() => void set({ blackout: true })}>Затемнить сцену</Button>
          )}
        </div>
      </div>
      {show && <NowLine show={show} test={test} winnerName={winnerName} />}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Select<HwVisual> label="Визуал обычных раундов" value={visual} options={[...HW_VISUALS]} onChange={onVisual} className="w-[240px]" />
        <Toggle label="Аватарки" checked={show?.avatars ?? true} onChange={(v) => void set({ avatars: v })} />
        <Toggle label="Звук" checked={show?.sound ?? true} onChange={(v) => void set({ sound: v })} />
        <Toggle label="Тестовый режим" checked={test} onChange={onTest} />
      </div>
    </div>
  );
}
