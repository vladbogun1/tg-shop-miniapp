"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import { riseItem, staggerContainer } from "@/lib/motion";
import { childrenOf, type TreeNode } from "../../model/tree";
import type { AdminCategory } from "../../model/types";
import type { CategoryTab } from "../category/CategoryDialog";
import { CategoryRow } from "./CategoryRow";
import { SortableItem } from "./SortableItem";

export interface TreeActions {
  shift: (c: AdminCategory, dir: -1 | 1) => void;
  /** Перетаскивание: новый порядок соседей одного родителя (null — корни). */
  reorder: (parentId: string | null, orderedIds: string[]) => void;
  edit: (c: AdminCategory, tab?: CategoryTab) => void;
  addChild: (parentId: string) => void;
  startMove: (c: AdminCategory) => void;
  remove: (c: AdminCategory) => void;
}

/** Режим «Выбрать»: отмеченные категории для панели массовых действий (null — выключен). */
export interface TreeSelection {
  ids: ReadonlySet<string>;
  toggle: (id: string, on: boolean) => void;
}

/**
 * Перетаскивание меняет порядок только среди соседей одного родителя: из одного списка в другой строка не
 * переходит (для этого «Переместить в…», там проверяются правила дерева). Бросили не туда — ничего не меняется.
 */
function useTreeDrag(categories: AdminCategory[], reorder: TreeActions["reorder"]) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const moving = categories.find((c) => c.id === active.id);
    const target = categories.find((c) => c.id === over.id);
    if (!moving || !target || (moving.parentId ?? null) !== (target.parentId ?? null)) return;
    const parentId = moving.parentId ?? null;
    const ids = childrenOf(categories, parentId).map((c) => c.id);
    reorder(parentId, arrayMove(ids, ids.indexOf(moving.id), ids.indexOf(target.id)));
  }
  return { sensors, onDragEnd };
}

interface TreeProps {
  tree: TreeNode[];
  visibleTree: TreeNode[];
  categories: AdminCategory[];
  searching: boolean;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  attrCount: Map<string, number>;
  busyId: string | undefined;
  actions: TreeActions;
  selection: TreeSelection | null;
}

/** Подкатегории корня с направляющей линией; свой список для перетаскивания. */
function ChildRows({ parent, kids, categories, searching, attrCount, busyId, actions, selection }: Omit<TreeProps, "tree" | "visibleTree" | "collapsed" | "onToggle"> & { parent: AdminCategory; kids: AdminCategory[] }) {
  const sibs = childrenOf(categories, parent.id);
  return (
    <motion.ul
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden border-t border-[var(--line)] bg-[var(--bg-2)]"
    >
      <SortableContext items={kids.map((k) => k.id)} strategy={verticalListSortingStrategy}>
        {kids.map((k) => {
          const i = sibs.findIndex((s) => s.id === k.id);
          return (
            <SortableItem key={k.id} id={k.id} name={k.name} disabled={searching}>
              {(handle) => (
                <CategoryRow
                  c={k}
                  depth={1}
                  dragHandle={handle}
                  childCount={0}
                  attrCount={attrCount.get(k.id)}
                  first={i === 0}
                  last={i === sibs.length - 1}
                  busy={busyId === k.id}
                  reorderDisabled={searching}
                  onUp={() => actions.shift(k, -1)}
                  onDown={() => actions.shift(k, 1)}
                  onEdit={(tab) => actions.edit(k, tab)}
                  onMove={() => actions.startMove(k)}
                  onDelete={() => actions.remove(k)}
                  selected={selection?.ids.has(k.id)}
                  onSelect={selection ? (on) => selection.toggle(k.id, on) : undefined}
                />
              )}
            </SortableItem>
          );
        })}
      </SortableContext>
    </motion.ul>
  );
}

/** Корни в порядке меню, под каждым — подкатегории с направляющей линией; корень без детей сам лист. */
export function CategoryTree(props: TreeProps) {
  const { tree, visibleTree, categories, searching, collapsed, onToggle, attrCount, busyId, actions, selection } = props;
  const { sensors, onDragEnd } = useTreeDrag(categories, actions.reorder);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={visibleTree.map((n) => n.cat.id)} strategy={verticalListSortingStrategy}>
        <motion.ul variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-2.5" aria-label="Дерево категорий">
          {visibleTree.map(({ cat, children }, ri) => {
            const open = !collapsed.has(cat.id) || searching;
            const rootIndex = tree.findIndex((n) => n.cat.id === cat.id);
            const childCount = childrenOf(categories, cat.id).length;
            return (
              <SortableItem key={cat.id} id={cat.id} name={cat.name} disabled={searching}>
                {(handle) => (
                  <motion.div variants={riseItem} className="card overflow-hidden p-0">
                    <CategoryRow
                      c={cat}
                      depth={0}
                      dragHandle={handle}
                      childCount={childCount}
                      attrCount={attrCount.get(cat.id)}
                      expanded={open}
                      onToggle={children.length ? () => onToggle(cat.id) : undefined}
                      first={rootIndex === 0}
                      last={rootIndex === tree.length - 1}
                      busy={busyId === cat.id}
                      reorderDisabled={searching}
                      onUp={() => actions.shift(cat, -1)}
                      onDown={() => actions.shift(cat, 1)}
                      onEdit={(tab) => actions.edit(cat, tab)}
                      onAddChild={cat.productCountDirect === 0 ? () => actions.addChild(cat.id) : undefined}
                      onMove={childCount === 0 ? () => actions.startMove(cat) : undefined}
                      onDelete={() => actions.remove(cat)}
                      index={ri}
                      selected={selection?.ids.has(cat.id)}
                      onSelect={selection ? (on) => selection.toggle(cat.id, on) : undefined}
                    />
                    <AnimatePresence initial={false}>
                      {open && children.length > 0 && (
                        <ChildRows
                          parent={cat}
                          kids={children}
                          categories={categories}
                          searching={searching}
                          attrCount={attrCount}
                          busyId={busyId}
                          actions={actions}
                          selection={selection}
                        />
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </SortableItem>
            );
          })}
        </motion.ul>
      </SortableContext>
    </DndContext>
  );
}
