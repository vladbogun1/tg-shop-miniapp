"use client";

/**
 * Translations (route "/translations") — uk/en layer over the Russian content
 * (docs/CONTENT-I18N.md). Russian is the source of truth; a translation applies only while the
 * hash of its source matches.
 *
 *  - «Перевод с ИИ»: a prompt for any AI chat (copied by hand, no API keys) → paste the answer →
 *    validation → import (origin AI). The AI also proofreads the Russian source; a fix is applied
 *    only on the admin's click, together with the translations of the NEW text.
 *  - «Все переводы»: list with filters, inline MANUAL edit and per-field reset.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Languages, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { adminApi, type TrLocale } from "@/lib/api";
import { buildWorkSet } from "@/lib/translation-check";
import { pendingCount, TR_EXPORT_KEY, useTranslationStats } from "@/lib/translations";
import { staggerContainer, riseItem } from "@/lib/motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CenterSpinner } from "@/components/ui/Spinner";
import { AiTranslate } from "@/components/translations/AiTranslate";
import { TranslationList } from "@/components/translations/TranslationList";

type Tab = "ai" | "list";

const LANG_NAME: Record<TrLocale, string> = { uk: "Українська", en: "English" };

export default function TranslationsPage() {
  const [tab, setTab] = useState<Tab>("ai");
  const { data: stats, refetch: refetchStats } = useTranslationStats();
  const exportQ = useQuery({
    queryKey: TR_EXPORT_KEY,
    queryFn: async () => {
      const [uk, en] = await Promise.all([adminApi.translationsExport("uk"), adminApi.translationsExport("en")]);
      return buildWorkSet(uk, en);
    },
    staleTime: 30_000,
  });
  const ws = exportQ.data;
  const pending = pendingCount(stats);
  const todoStrings = useMemo(() => (ws ? ws.strings.filter((s) => s.needs.uk || s.needs.en).length : 0), [ws]);

  return (
    <div>
      <PageHeader
        title="Переводы"
        subtitle="Русский — оригинал. Украинский и английский — слой поверх: показывается, только пока оригинал не менялся."
        actions={
          <Button
            variant="outline"
            icon={<RefreshCw className={exportQ.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            onClick={() => {
              exportQ.refetch();
              refetchStats();
            }}
          >
            Обновить
          </Button>
        }
      />

      {stats && (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mb-5 grid gap-3 sm:grid-cols-3">
          {(["uk", "en"] as const).map((l) => {
            const c = stats.locales[l]?.ALL;
            if (!c) return null;
            const total = c.translated + c.stale + c.missing;
            const pct = total ? Math.round((c.translated / total) * 100) : 100;
            return (
              <motion.div key={l} variants={riseItem} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="field-label">
                    {l.toUpperCase()} · {LANG_NAME[l]}
                  </div>
                  <div className="kpi-num text-[22px]">{pct}%</div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div className="h-full rounded-full bg-[var(--ok)]" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 tabular text-[12px] font-medium text-[var(--text-muted)]">
                  <span>переведено {c.translated}</span>
                  <span className={c.stale ? "text-[var(--text)]" : undefined}>устарело {c.stale}</span>
                  <span className={c.missing ? "text-[var(--text)]" : undefined}>нет {c.missing}</span>
                </div>
              </motion.div>
            );
          })}
          <motion.div variants={riseItem} className="card flex flex-col justify-between p-4">
            <div className="field-label">Нужно перевести</div>
            <div className="kpi-num mt-2 text-[30px]">{pending}</div>
            <div className="mt-2 tabular text-[12px] font-medium text-[var(--text-muted)]">
              полей × языков{ws ? ` · ${todoStrings} уникальных строк` : ""}
            </div>
          </motion.div>
        </motion.div>
      )}

      <SegmentedControl<Tab>
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "ai", label: "Перевод с ИИ", count: todoStrings || undefined },
          { value: "list", label: "Все переводы" },
        ]}
      />

      {exportQ.isLoading ? (
        <CenterSpinner label="Загрузка текстов…" />
      ) : exportQ.isError || !ws ? (
        <EmptyState
          icon={Languages}
          title="Не удалось загрузить"
          description="Проверьте соединение и нажмите «Обновить»."
        />
      ) : (
        <>
          {/* Both stay mounted: switching tabs must not drop a pasted answer or edits. */}
          <div hidden={tab !== "ai"}>
            <AiTranslate ws={ws} />
          </div>
          <div hidden={tab !== "list"}>
            <TranslationList ws={ws} />
          </div>
        </>
      )}
    </div>
  );
}
