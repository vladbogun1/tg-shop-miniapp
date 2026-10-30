"use client";

import { Globe, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@shop/ui/admin-button";
import { Badge } from "@/components/ui/Badge";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { formatIsoOrNull } from "@/lib/format-iso";
import type { RevalidateStatus } from "../api";
import { isMissing, useRevalidateSite, useSiteStatus } from "../queries";

/**
 * «Сайт»: заставить публичный сайт (ISR) пересобрать страницы сейчас, не дожидаясь срока —
 * после правок, которые сами обновление не запускают.
 */
export function SitePanel() {
  const rootRef = useRef<HTMLElement>(null);

  // «Внимание» links here as /settings#site; the panel mounts only after the settings load.
  useEffect(() => {
    if (window.location.hash === "#site") rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const statusQ = useSiteStatus();
  const revalidate = useRevalidateSite();

  return (
    <section id="site" ref={rootRef} className="panel min-w-0 scroll-mt-[88px] p-5">
      <PanelHeader icon={Globe} title="Сайт" description="Сайт обновляет страницы сам; кнопка — если нужно сразу." />
      <Button
        variant="surface"
        className="w-full"
        loading={revalidate.isPending}
        icon={<RefreshCw className="h-4 w-4" />}
        onClick={() => revalidate.mutate()}
      >
        Обновить сайт
      </Button>
      <div className="mt-4 text-[13px]">
        <RevalidateStatusView status={statusQ.data} error={statusQ.error} loading={statusQ.isLoading} />
      </div>
    </section>
  );
}

function RevalidateStatusView({
  status,
  error,
  loading,
}: {
  status?: RevalidateStatus;
  error: unknown;
  loading: boolean;
}) {
  if (loading) return <span className="text-[var(--text-faint)]">Загрузка статуса…</span>;
  if (error) {
    return (
      <span className="text-[var(--text-faint)]">
        {isMissing(error) ? "Статус последнего обновления пока недоступен." : "Не удалось получить статус."}
      </span>
    );
  }
  if (!status) return null;
  if (!status.enabled) {
    return <span className="text-[var(--text-faint)]">Обновление сайта не настроено на сервере (SITE_REVALIDATE_URL).</span>;
  }
  // Новее из «последний успех / последняя ошибка» — текущее состояние.
  const okAt = status.lastSuccessAt ? Date.parse(status.lastSuccessAt) : 0;
  const errAt = status.lastErrorAt ? Date.parse(status.lastErrorAt) : 0;
  let at: string | null = null;
  let ok: boolean | null = null;
  let err: string | null = null;
  if (errAt > okAt) {
    at = formatIsoOrNull(status.lastErrorAt);
    ok = false;
    err = status.lastError || "Ошибка без описания";
  } else if (okAt > 0) {
    at = formatIsoOrNull(status.lastSuccessAt);
    ok = true;
  }
  if (!at) return <span className="text-[var(--text-faint)]">Сайт ещё не обновлялся с момента запуска сервера.</span>;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--text-muted)]">Последнее обновление:</span>
        <b className="text-[var(--text)]">{at}</b>
        {ok === true && <Badge tone="ok">Успешно</Badge>}
        {ok === false && <Badge tone="danger">Ошибка</Badge>}
      </div>
      {err && <p className="break-words text-[12px] text-[var(--danger-ink)]">{err}</p>}
    </div>
  );
}
