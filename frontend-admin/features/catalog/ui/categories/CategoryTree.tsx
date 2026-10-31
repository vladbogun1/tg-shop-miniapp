"use client";

import { AnimatePresence, motion } from "framer-motion";
import { riseItem, staggerContainer } from "@/lib/motion";
import { childrenOf, type TreeNode } from "../../model/tree";
import type { AdminCategory } from "../../model/types";
import type { CategoryTab } from "../category/CategoryDialog";
import { CategoryRow } from "./CategoryRow";

export interface TreeActions {
  shift: (c: AdminCategory, dir: -1 | 1) => void;
  edit: (c: AdminCategory, tab?: CategoryTab) => void;
  addChild: (parentId: string) => void;
  startMove: (c: AdminCategory) => void;
  remove: (c: AdminCategory) => void;
}

/** Корни в порядке меню, под каждым — подкатегории с направляющей линией; корень без детей сам лист. */
export function CategoryTree({
  tree,
  visibleTree,
  categories,
  searching,
  collapsed,
  onToggle,
  attrCount,
  busyId,
  actions,
}: {
  tree: TreeNode[];
  visibleTree: TreeNode[];
  categories: AdminCategory[];
  searching: boolean;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  attrCount: Map<string, number>;
  busyId: string | undefined;
  actions: TreeActions;
}) {
  return (
  <motion.ul variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-2.5" aria-label="Дерево категорий">
    {visibleTree.map(({ cat, children }, ri) => {
      const open = !collapsed.has(cat.id) || searching;
      const allSiblings = tree.length;
      return (
        <motion.li key={cat.id} layout variants={riseItem} className="card overflow-hidden p-0">
          <CategoryRow
            c={cat}
            depth={0}
            childCount={childrenOf(categories, cat.id).length}
            attrCount={attrCount.get(cat.id)}
            expanded={open}
            onToggle={
              children.length
                ? () => onToggle(cat.id)
                            : undefined
            }
            first={tree.findIndex((n) => n.cat.id === cat.id) === 0}
            last={tree.findIndex((n) => n.cat.id === cat.id) === allSiblings - 1}
            busy={busyId === cat.id}
            reorderDisabled={searching}
            onUp={() => actions.shift(cat, -1)}
            onDown={() => actions.shift(cat, 1)}
            onEdit={(tab) => actions.edit(cat, tab)}
            onAddChild={cat.productCountDirect === 0 ? () => actions.addChild(cat.id) : undefined}
            onMove={
              childrenOf(categories, cat.id).length === 0
                ? () => actions.startMove(cat)
                : undefined
            }
            onDelete={() => actions.remove(cat)}
            index={ri}
          />
          <AnimatePresence initial={false}>
            {open && children.length > 0 && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden border-t border-[var(--line)] bg-[var(--bg-2)] py-1"
              >
                {/* Guide line of the subtree */}
                <span aria-hidden className="absolute bottom-4 left-[27px] top-0 w-px bg-[var(--line-strong)]" />
                {children.map((k) => {
                  const sibs = childrenOf(categories, cat.id);
                  const i = sibs.findIndex((s) => s.id === k.id);
                  return (
                    <li key={k.id}>
                      <CategoryRow
                        c={k}
                        depth={1}
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
                      />
                    </li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>
        </motion.li>
      );
    })}
  </motion.ul>
  );
}
