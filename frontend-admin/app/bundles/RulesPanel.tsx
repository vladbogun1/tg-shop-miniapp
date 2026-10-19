"use client";

/**
 * «Пары категорий»: which accessories to offer next to which products. The order of the list is the
 * order of the offer (first pair = first suggestions). Each change goes to the server at once.
 * `kind="setup"` — the same list for «Собери сетап» (big items next to big items, /setup-rules).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUp, Link2, Plus, Trash2 } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api";
import { bundlesApi, type BundleRule } from "@/lib/bundles";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { CategoryTreeSelect } from "@/components/catalog/CategoryTreeSelect";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { QueryState } from "@/components/ui/QueryState";
import { Toggle } from "@/components/ui/Toggle";
import { PanelHeader } from "../settings/PanelHeader";

export const RULES_KEY = ["bundles", "rules"] as const;
export const SETUP_RULES_KEY = ["bundles", "setup-rules"] as const;

const KINDS = {
  addon: {
    key: RULES_KEY,
    list: bundlesApi.rules,
    create: bundlesApi.createRule,
    patch: bundlesApi.patchRule,
    remove: bundlesApi.deleteRule,
    title: "Пары категорий",
    description: "К товару из левой категории (и её подкатегорий) предлагаем товары из правой. Порядок списка — порядок предложений.",
    empty: "Пар пока нет — без них покупателю нечего предложить.",
    targetLabel: "Предлагать из",
    targetPlaceholder: "Категория аксессуаров",
  },
  setup: {
    key: SETUP_RULES_KEY,
    list: bundlesApi.setupRules,
    create: bundlesApi.createSetupRule,
    patch: bundlesApi.patchSetupRule,
    remove: bundlesApi.deleteSetupRule,
    title: "«Собери сетап»: пары",
    description: "Крупные товары рядом с крупными (мышь → клавиатура). Подбираются в цвет; скидка — «Скидка в сетапе».",
    empty: "Пар нет — блок «Собери сетап» не показывается.",
    targetLabel: "Предлагать из",
    targetPlaceholder: "Категория товаров",
  },
} as const;

const byOrder = (a: BundleRule, b: BundleRule) => a.sortOrder - b.sortOrder || a.id - b.id;

export function RulesPanel({ kind = "addon" }: { kind?: keyof typeof KINDS }) {
  const cfg = KINDS[kind];
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const rulesQ = useQuery({ queryKey: cfg.key, queryFn: cfg.list });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: adminApi.categories, staleTime: 60_000 });
  const rules = useMemo(() => [...(rulesQ.data ?? [])].sort(byOrder), [rulesQ.data]);

  const [busy, setBusy] = useState<number | "add" | null>(null);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: cfg.key });
    qc.invalidateQueries({ queryKey: ["bundles", "pairs"] });
    qc.invalidateQueries({ queryKey: ["bundles", "preview"] });
  };
  const fail = (e: unknown, fallback: string) => push(e instanceof ApiError ? e.message : fallback, "error");

  async function toggle(r: BundleRule, active: boolean) {
    setBusy(r.id);
    try {
      await cfg.patch(r.id, { active });
      refresh();
    } catch (e) {
      fail(e, "Не удалось изменить пару");
    } finally {
      setBusy(null);
    }
  }

  /** Swap with the neighbour; equal sort orders (old data) → renumber the whole list by 10. */
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rules.length) return;
    const a = rules[i];
    const b = rules[j];
    setBusy(a.id);
    try {
      if (a.sortOrder !== b.sortOrder) {
        await cfg.patch(a.id, { sortOrder: b.sortOrder });
        await cfg.patch(b.id, { sortOrder: a.sortOrder });
      } else {
        const next = [...rules];
        [next[i], next[j]] = [next[j], next[i]];
        for (let k = 0; k < next.length; k++) {
          const want = (k + 1) * 10;
          if (next[k].sortOrder !== want) await cfg.patch(next[k].id, { sortOrder: want });
        }
      }
      refresh();
    } catch (e) {
      fail(e, "Не удалось переставить");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: BundleRule) {
    const ok = await confirm({
      title: "Удалить пару?",
      message: (
        <>
          К товарам «{r.sourceCategoryName}» больше не будут предлагаться «{r.targetCategoryName}». Заказы, где скидка уже
          дана, не изменятся.
        </>
      ),
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await cfg.remove(r.id);
      push("Пара удалена", "ok");
      refresh();
    } catch (e) {
      fail(e, "Не удалось удалить");
    } finally {
      setBusy(null);
    }
  }

  const duplicate = !!source && !!target && rules.some((r) => r.sourceCategoryId === source && r.targetCategoryId === target);
  const same = !!source && source === target;
  const addError = same ? "Одна и та же категория" : duplicate ? "Такая пара уже есть" : undefined;

  async function add() {
    if (!source || !target || addError) return;
    setBusy("add");
    try {
      const sortOrder = (rules.reduce((m, r) => Math.max(m, r.sortOrder), 0) || 0) + 10;
      await cfg.create({ sourceCategoryId: source, targetCategoryId: target, sortOrder, active: true });
      push("Пара добавлена", "ok");
      setSource("");
      setTarget("");
      refresh();
    } catch (e) {
      fail(e, "Не удалось добавить");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel min-w-0 p-4 sm:p-5">
      <PanelHeader
        icon={Link2}
        title={cfg.title}
        description={cfg.description}
      />

      <QueryState isLoading={rulesQ.isLoading} isError={rulesQ.isError} error={rulesQ.error} refetch={rulesQ.refetch} loadingLabel="Загрузка пар">
        {rules.length === 0 ? (
          <p className="card-2 p-3 text-[13px] text-[var(--text-muted)]">{cfg.empty}</p>
        ) : (
          <ol className="flex min-w-0 flex-col gap-2">
            {rules.map((r, i) => (
              <li
                key={r.id}
                className={cn(
                  "card-2 flex min-w-0 items-center gap-2 py-2 pl-3 pr-1.5 transition-opacity",
                  !r.active && "opacity-60",
                  busy === r.id && "opacity-50"
                )}
              >
                <div className="min-w-0 flex-1 text-[13.5px] leading-snug">
                  <span className="font-semibold text-[var(--text)]">{r.sourceCategoryName}</span>
                  <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 align-[-2px] text-[var(--accent-hi)]" aria-label="→" />
                  <span className="text-[var(--text)]">{r.targetCategoryName}</span>
                  {!r.active && <span className="ml-1.5 text-[11.5px] text-[var(--text-faint)]">выкл.</span>}
                </div>
                <Toggle checked={r.active} disabled={busy !== null} onChange={(v) => toggle(r, v)} />
                <div className="flex shrink-0 items-center">
                  <IconBtn label="Выше" disabled={busy !== null || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="Ниже" disabled={busy !== null || i === rules.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="Удалить" danger disabled={busy !== null} onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ol>
        )}
      </QueryState>

      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <div className="field-label mb-2">Новая пара</div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
          <CategoryTreeSelect
            label="К товарам из"
            mode="any"
            categories={categories}
            value={source}
            onChange={setSource}
            placeholder="Категория товара"
          />
          <ArrowRight className="hidden h-4 w-4 self-center text-[var(--text-faint)] sm:mb-3 sm:block sm:self-end" />
          <CategoryTreeSelect
            label={cfg.targetLabel}
            mode="any"
            categories={categories}
            value={target}
            onChange={setTarget}
            placeholder={cfg.targetPlaceholder}
            error={addError}
          />
        </div>
        <Button
          className="mt-3 w-full sm:w-auto"
          variant="accent"
          icon={<Plus className="h-4 w-4" />}
          disabled={!source || !target || !!addError}
          loading={busy === "add"}
          onClick={add}
        >
          Добавить пару
        </Button>
      </div>
      {confirmUi}
    </section>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "focusable hit grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors disabled:opacity-30",
        danger
          ? "hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)]"
          : "hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}
