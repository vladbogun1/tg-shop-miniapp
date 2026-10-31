"use client";

import { Layers, Plus, Settings2, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Spinner } from "@/components/ui/Spinner";
import { groupAttributes } from "../../model/attributes";
import type { AdminCategory, AdminSpecAttribute } from "../../model/types";
import { useRemoveAttribute, useSpecAttributesQuery, useSpecGroupsQuery, useSwapAttributes } from "../../queries";
import { AttributeDialog } from "../attribute/AttributeDialog";
import { GroupsDialog } from "../GroupsDialog";
import { AttributeRow } from "./AttributeRow";
import { Note } from "./parts";

/** «Характеристики»: схема категории — унаследованные серым, свои с порядком; сохраняется сразу. */
export function CategorySpecsTab({
  open,
  category,
  categories,
  hasChildren,
}: {
  open: boolean;
  /** null = new category (nothing to edit yet). */
  category: AdminCategory | null;
  categories: AdminCategory[];
  hasChildren: boolean;
}) {
  const [attrEditing, setAttrEditing] = useState<AdminSpecAttribute | null>(null);
  const [attrOpen, setAttrOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [busyAttr, setBusyAttr] = useState<string | null>(null);
  const swap = useSwapAttributes();
  const removeAttribute = useRemoveAttribute();

  const attrsQ = useSpecAttributesQuery(category?.id, open && !!category);
  const groupsQ = useSpecGroupsQuery({ enabled: open });
  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data]);
  const attrs = useMemo(() => {
    const list = attrsQ.data ?? [];
    // Inherited first (global, then parent), then own — each by sort.
    const rank = (a: AdminSpecAttribute) => (a.categoryId === null ? 0 : a.categoryId === category?.id ? 2 : 1);
    return [...list].sort((a, b) => rank(a) - rank(b) || a.sort - b.sort);
  }, [attrsQ.data, category]);
  const isOwn = (a: AdminSpecAttribute) => !a.inherited && a.categoryId === category?.id;
  const own = attrs.filter(isOwn);
  const grouped = groupAttributes(attrs, groups);
  const highlightOthers = attrs.filter((a) => a.highlight && a.id !== attrEditing?.id).length;

  const edit = (a: AdminSpecAttribute | null) => {
    setAttrEditing(a);
    setAttrOpen(true);
  };

  async function moveAttr(a: AdminSpecAttribute, dir: -1 | 1) {
    const sameGroup = own.filter((x) => x.group === a.group);
    const i = sameGroup.findIndex((x) => x.id === a.id);
    const other = sameGroup[i + dir];
    if (!other) return;
    setBusyAttr(a.id);
    try {
      await swap.mutateAsync({ a, other, dir });
    } catch {
      // the error is already toasted by the mutation
    } finally {
      setBusyAttr(null);
    }
  }

  async function removeAttr(a: AdminSpecAttribute) {
    setBusyAttr(a.id);
    try {
      await removeAttribute(a);
    } finally {
      setBusyAttr(null);
    }
  }

  return (
    <>
    {!category ? (
      <div className="hud-frame flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-[var(--line)] px-6 py-10 text-center">
        <SlidersHorizontal className="h-6 w-6 text-[var(--text-faint)]" />
        <p className="text-[13px] text-[var(--text-muted)]">Сначала создайте категорию — затем добавьте её характеристики.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-md text-[12.5px] leading-snug text-[var(--text-faint)]">
            {hasChildren
              ? "Характеристики родителя наследуют все подкатегории — по ним фильтруется и страница родителя."
              : "Свои характеристики категории. Серые — унаследованы от родителя или глобальные."}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" icon={<Layers className="h-3.5 w-3.5" />} onClick={() => setGroupsOpen(true)}>
              Группы
            </Button>
            <Button
              size="sm"
              variant="surface"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                edit(null);
              }}
            >
              Характеристика
            </Button>
          </div>
        </div>
  
        {attrsQ.isLoading ? (
          <div className="grid place-items-center py-10">
            <Spinner />
          </div>
        ) : attrsQ.isError ? (
          <Note warn>
            Не удалось загрузить характеристики.{" "}
            <button type="button" className="font-semibold text-[var(--accent-hi)] hover:underline" onClick={() => attrsQ.refetch()}>
              Повторить
            </button>
          </Note>
        ) : attrs.length === 0 ? (
          <div className="hud-frame flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-[var(--line)] px-6 py-10 text-center">
            <SlidersHorizontal className="h-6 w-6 text-[var(--accent)]" />
            <p className="font-display text-[14px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">Характеристик нет</p>
            <p className="max-w-sm text-[12.5px] text-[var(--text-muted)]">
              Добавьте вес, сенсор, подключение… — по ним появятся фильтры на витрине и форма в карточке товара.
            </p>
          </div>
        ) : (
        grouped.map((g) => (
          <div key={g.key} className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)]">
            <div className="font-display flex items-center justify-between bg-[var(--bg-2)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <span>{g.label}</span>
              <span className="tabular text-[var(--text-faint)]">{g.items.length}</span>
            </div>
            <ul>
              {g.items.map((a) => {
                const ownInGroup = own.filter((x) => x.group === a.group);
                return (
                  <AttributeRow
                    key={a.id}
                    a={a}
                    mine={isOwn(a)}
                    from={a.categoryId === null ? "глобальная" : `из «${categories.find((c) => c.id === a.categoryId)?.name ?? "родителя"}»`}
                    idx={ownInGroup.findIndex((x) => x.id === a.id)}
                    ownInGroup={ownInGroup.length}
                    busy={busyAttr === a.id}
                    onEdit={() => edit(a)}
                    onMove={(dir) => moveAttr(a, dir)}
                    onRemove={() => removeAttr(a)}
                  />
                );
              })}
            </ul>
          </div>
        ))
      )}
        <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-faint)]">
          <Settings2 className="h-3.5 w-3.5" /> * — обязательная: без неё карточка товара «неполная».
        </p>
      </div>
    )}
      {category && (
        <AttributeDialog
          open={attrOpen}
          attribute={attrEditing}
          categoryId={category.id}
          categoryName={category.name}
          groups={groups}
          takenKeys={attrs.map((a) => a.key)}
          highlightOthers={highlightOthers}
          onClose={() => setAttrOpen(false)}
        />
      )}
      <GroupsDialog open={groupsOpen} groups={groups} usedKeys={new Set(attrs.map((a) => a.group))} onClose={() => setGroupsOpen(false)} />
    </>
  );
}
