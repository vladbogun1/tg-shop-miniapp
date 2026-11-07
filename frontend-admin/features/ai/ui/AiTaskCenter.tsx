"use client";

/**
 * Центр ИИ-задач: вкладки Идут · Проверить · Проблемы · История, список по страницам, подробности в шторке на
 * телефоне и в правой панели на ПК. «Проверить» и «Проблемы» совпадают со счётчиками в меню и в чипе ✦; результат
 * карточки ведёт в ревью. Деньги и промпты в списке и в подробностях видит только финансист (решает сервер).
 */
import { Button } from "@shop/ui/admin-button";
import { Drawer } from "@shop/ui/overlay";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { Tabs } from "@/components/ui/Tabs";
import { useIsDesktop } from "@/lib/use-media";
import { nowMs } from "@shop/core/time";
import type { AiTaskTab } from "../api";
import { defaultTab, EMPTY_HINT, EMPTY_TEXT, TASK_TABS, tabCount, taskRowView } from "../model/task-center";
import { useAiSummary } from "../queries";
import { TASKS_PAGE_SIZE, useAiTasks } from "../queries-center";
import { AiTaskDetail } from "./AiTaskDetail";
import { AiTaskRow } from "./AiTaskRow";

/** Вкладка при входе по сводке (макет 06); пока сводка не пришла — null, чтобы «Идут» не мигнула перед «Проверить». */
function useEntryTab() {
  const summary = useAiSummary();
  const [picked, setPicked] = useState<AiTaskTab | null>(null);
  const tab = picked ?? (summary.isLoading ? null : defaultTab(summary.data?.review));
  return { tab, shown: tab ?? "review", pick: setPicked };
}

export function AiTaskCenter() {
  const { tab, shown, pick } = useEntryTab();
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const desktop = useIsDesktop();
  const q = useAiTasks(shown, page, tab !== null);
  const items = (q.data?.items ?? []).map((r) => taskRowView(r, nowMs()));
  const open = items.find((v) => v.id === openId) ?? null;
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / TASKS_PAGE_SIZE));

  function changeTab(next: AiTaskTab) {
    pick(next);
    setPage(0);
    setOpenId(null);
  }

  return (
    <div className="min-w-0">
      <PageHeader title="ИИ-задачи" subtitle="Что ИИ делает сейчас, что ждёт вашей проверки и где он не справился" />
      <Tabs
        className="mb-4"
        value={shown}
        onChange={changeTab}
        items={TASK_TABS.map((t) => ({ ...t, count: tabCount(t.value, q.data?.counts) }))}
      />
      <QueryState isLoading={tab === null || q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загружаем задачи…">
        {items.length === 0 ? (
          <EmptyState icon={Sparkles} title={EMPTY_TEXT[shown]} description={EMPTY_HINT[shown]} />
        ) : (
          <div className="flex flex-col gap-2" data-testid="ai-task-list">
            {items.map((v) => (
              <AiTaskRow key={v.id} view={v} selected={v.id === openId} onOpen={() => setOpenId(v.id)} />
            ))}
          </div>
        )}
        {pages > 1 && <Pager page={page} pages={pages} onPage={setPage} />}
      </QueryState>
      {desktop ? (
        <Drawer open={!!open} onClose={() => setOpenId(null)} title="Задача ИИ" width="max-w-md">
          {open && <AiTaskDetail view={open} onDone={() => setOpenId(null)} />}
        </Drawer>
      ) : (
        <ActionSheet open={!!open} title="Задача ИИ" onClose={() => setOpenId(null)}>
          {open && <AiTaskDetail view={open} onDone={() => setOpenId(null)} />}
        </ActionSheet>
      )}
    </div>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-[12.5px] text-[var(--text-muted)]">
      <Button variant="surface" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
        Назад
      </Button>
      <span>
        Страница {page + 1} из {pages}
      </span>
      <Button variant="surface" size="sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
        Дальше
      </Button>
    </div>
  );
}
