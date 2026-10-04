"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Globe, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api";
import { settingsApi, type RevalidateStatus } from "@/lib/settings";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "./draft";
import { PanelHeader } from "./PanelHeader";

/** Endpoints come from package A; until it is merged they answer 404. */
function isMissing(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.status === 405);
}

/**
 * «Сайт»: force the public site (ISR) to rebuild its pages now instead of waiting for them to
 * expire — after editing things that do not trigger a revalidation themselves.
 */
export function SitePanel() {
  const { push } = useToast();
  const statusQ = useQuery({
    queryKey: ["site-revalidate-status"],
    queryFn: settingsApi.revalidateStatus,
    retry: false,
    refetchInterval: (q) => (q.state.error ? false : 30_000),
  });

  const revalidate = useMutation({
    mutationFn: settingsApi.revalidateSite,
    onSuccess: () => {
      push("Сайт обновляется — страницы пересоберутся в течение минуты", "ok");
      setTimeout(() => statusQ.refetch(), 3_000);
    },
    onError: (e) =>
      push(
        isMissing(e)
          ? "Обновление сайта ещё не подключено на сервере"
          : e instanceof ApiError
            ? e.message
            : "Не удалось обновить сайт",
        "error"
      ),
  });

  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader icon={Globe} title="Сайт" description="maxsolkh.shop обновляет страницы сам; кнопка — если нужно сразу." />
      <Button
        variant="accent"
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
  if (status.configured === false) {
    return <span className="text-[var(--text-faint)]">Обновление сайта не настроено на сервере (SITE_REVALIDATE_URL).</span>;
  }
  const at = formatDateTime(status.lastAt ?? status.lastRunAt);
  const ok = status.ok ?? status.success;
  const err = status.error ?? (ok === false ? status.message : null);
  if (!at) return <span className="text-[var(--text-faint)]">Сайт ещё не обновлялся с момента запуска сервера.</span>;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--text-muted)]">Последнее обновление:</span>
        <b className="text-[var(--text)]">{at}</b>
        {ok === true && <Badge tone="ok">Успешно</Badge>}
        {ok === false && <Badge tone="danger">Ошибка</Badge>}
      </div>
      {err && <p className="break-words text-[12px] text-[var(--danger)]">{err}</p>}
    </div>
  );
}
