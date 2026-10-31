"use client";

/**
 * The OBS scene panel of the remote: is a scene connected, what it shows now, the scene link,
 * hide (transparent) / pause screen / blackout, the visual of ordinary rounds, avatars/sound and the rehearsal switch.
 */
import { Copy, ExternalLink, Eye, EyeOff, Moon, Pause, Play, Sun } from "lucide-react";
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

function ModeBadges({ show }: { show: HwShow | null }) {
  return (
    <>
      {show?.hidden && <Badge tone="warn">Сцена скрыта — в эфире стрим</Badge>}
      {show?.pause && <Badge tone="info">На сцене экран паузы</Badge>}
      {show?.blackout && <Badge tone="danger">Затемнено</Badge>}
    </>
  );
}

type SetShow = (patch: Parameters<typeof hwDraw.setShow>[0]) => void;

/** What the stream sees: the scene, the between-rounds screen or the stream itself under a transparent scene. */
function SceneButtons({ show, set }: { show: HwShow | null; set: SetShow }) {
  return (
    <>
      {show?.hidden ? (
        <Button size="sm" variant="accent" icon={<Eye className="h-4 w-4" />} onClick={() => set({ hidden: false })}>Проявить сцену</Button>
      ) : (
        <Button size="sm" variant="outline" icon={<EyeOff className="h-4 w-4" />} onClick={() => set({ hidden: true })}>Скрыть сцену (прозрачно)</Button>
      )}
      {show?.pause ? (
        <Button size="sm" variant="accent" icon={<Play className="h-4 w-4" />} onClick={() => set({ pause: false })}>Убрать паузу</Button>
      ) : (
        <Button size="sm" variant="outline" icon={<Pause className="h-4 w-4" />} onClick={() => set({ pause: true })}>Экран паузы</Button>
      )}
      {show?.blackout ? (
        <Button size="sm" variant="danger" icon={<Sun className="h-4 w-4" />} onClick={() => set({ blackout: false })}>Убрать затемнение</Button>
      ) : (
        <Button size="sm" variant="outline" icon={<Moon className="h-4 w-4" />} onClick={() => set({ blackout: true })}>Затемнить</Button>
      )}
    </>
  );
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
  const set: SetShow = (patch) =>
    void hwDraw.setShow(patch).catch((e: unknown) => push(e instanceof Error ? e.message : "Не получилось", "error"));

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SceneStatus show={show} online={online} />
        <ModeBadges show={show} />
        {test && <Badge tone="danger">Тест · участники ненастоящие</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="surface" icon={<ExternalLink className="h-4 w-4" />} disabled={!url} onClick={() => window.open(url, "hw-stage")}>Открыть сцену</Button>
          <Button size="sm" variant="surface" icon={<Copy className="h-4 w-4" />} disabled={!url}
            onClick={() => navigator.clipboard.writeText(url).then(() => push("Ссылка для OBS скопирована: Источник → Браузер, 1920×1080", "ok"))}>
            Ссылка для OBS
          </Button>
          <SceneButtons show={show} set={set} />
        </div>
      </div>
      {show && <NowLine show={show} test={test} winnerName={winnerName} />}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Select<HwVisual> label="Визуал обычных раундов" value={visual} options={[...HW_VISUALS]} onChange={onVisual} className="w-[240px]" />
        <Toggle label="Аватарки" checked={show?.avatars ?? true} onChange={(v) => set({ avatars: v })} />
        <Toggle label="Звук" checked={show?.sound ?? true} onChange={(v) => set({ sound: v })} />
        <Toggle label="Тестовый режим" checked={test} onChange={onTest} />
      </div>
    </div>
  );
}
