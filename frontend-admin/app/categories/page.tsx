"use client";

/**
 * «Категории» (route "/categories", formerly «Теги»): the 2-level catalog tree.
 *  - roots in menu order, subcategories indented under a guide line; a root without children is
 *    itself a leaf (products lie in it);
 *  - counters: products of the subtree / lying right in the category, «скрыта из меню»;
 *  - ↑↓ reorder within siblings (saved at once), «Переместить в…» (another root or to the top level),
 *    add a root / a subcategory, delete with the server's guards explained;
 *  - the dialog edits the basics, SEO and the characteristics schema (see CategoryDialog).
 * Deep link "/categories?edit=<id>" opens a category (the audit log links here).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CornerDownRight,
  EyeOff,
  FolderInput,
  FolderPlus,
  FolderTree,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { adminApi, ApiError, type AdminCategory, type CategoryReorderItem } from "@/lib/api";
import { buildTree, byOrder, childrenOf, plural, productsWord } from "@/lib/catalog-admin";
import { cn } from "@/lib/cn";
import { staggerContainer, riseItem } from "@/lib/motion";
import { useToast } from "@/lib/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { CategoryDialog } from "@/components/catalog/CategoryDialog";
import { GroupsDialog } from "@/components/catalog/GroupsDialog";

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();

export default function CategoriesPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();

  const q = useQuery({ queryKey: ["categories"], queryFn: adminApi.categories });
  const categories = useMemo(() => q.data ?? [], [q.data]);
  const groupsQ = useQuery({ queryKey: ["spec-groups"], queryFn: adminApi.specGroups, staleTime: 60_000 });
  const schemaQ = useQuery({ queryKey: ["catalog-schema"], queryFn: adminApi.catalogSchema, staleTime: 60_000 });

  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ category: AdminCategory | null; parentId: string | null; tab?: "main" | "seo" | "specs" } | null>(null);
  const [moving, setMoving] = useState<AdminCategory | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const nq = norm(search);
  const visibleTree = useMemo(() => {
    if (!nq) return tree;
    const hit = (c: AdminCategory) => norm(c.name).includes(nq) || c.slug.includes(nq);
    return tree
      .map((n) => ({ cat: n.cat, children: hit(n.cat) ? n.children : n.children.filter(hit) }))
      .filter((n) => hit(n.cat) || n.children.length > 0);
  }, [tree, nq]);

  const attrCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of schemaQ.data?.attributes ?? []) if (a.categoryId) m.set(a.categoryId, (m.get(a.categoryId) ?? 0) + 1);
    return m;
  }, [schemaQ.data]);

  const stats = useMemo(() => {
    const roots = tree.length;
    const subs = categories.length - roots;
    const products = tree.reduce((s, n) => s + n.cat.productCount, 0);
    const hidden = categories.filter((c) => !c.showInMenu).length;
    return { roots, subs, products, hidden };
  }, [tree, categories]);

  // Deep link from the audit log.
  useEffect(() => {
    if (!q.data || typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("edit");
    if (!id) return;
    const c = q.data.find((x) => x.id === id);
    if (c) setDialog({ category: c, parentId: c.parentId });
    sp.delete("edit");
    const qs = sp.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [q.data]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["catalog-schema"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function saveOrder(rows: CategoryReorderItem[], optimistic: AdminCategory[], msg?: string) {
    const prev = q.data;
    qc.setQueryData(["categories"], optimistic);
    try {
      await adminApi.reorderCategories(rows);
      if (msg) push(msg, "ok");
      refresh();
    } catch (e) {
      qc.setQueryData(["categories"], prev);
      push(e instanceof ApiError ? e.message : "Не удалось сохранить порядок", "error");
    }
  }

  function move(c: AdminCategory, dir: -1 | 1) {
    const siblings = childrenOf(categories, c.parentId ?? null);
    const i = siblings.findIndex((s) => s.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const next = [...siblings];
    [next[i], next[j]] = [next[j], next[i]];
    const rows = next.map((s, k) => ({ id: s.id, parentId: s.parentId ?? null, sortOrder: (k + 1) * 10 }));
    const order = new Map(rows.map((r) => [r.id, r.sortOrder]));
    saveOrder(
      rows,
      categories.map((x) => (order.has(x.id) ? { ...x, sortOrder: order.get(x.id)! } : x))
    );
  }

  async function doMove() {
    if (!moving) return;
    const parentId = moveTarget || null;
    const siblings = childrenOf(categories, parentId).filter((s) => s.id !== moving.id);
    const sortOrder = siblings.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 10;
    const target = categories.find((c) => c.id === parentId);
    setMoving(null);
    await saveOrder(
      [{ id: moving.id, parentId, sortOrder }],
      categories.map((x) => (x.id === moving.id ? { ...x, parentId, sortOrder } : x)),
      target ? `«${moving.name}» теперь в «${target.name}»` : `«${moving.name}» — корневая категория`
    );
  }

  async function remove(c: AdminCategory) {
    const kids = childrenOf(categories, c.id).length;
    if (kids > 0) {
      await confirm({
        title: "Нельзя удалить",
        message: `В «${c.name}» ${kids} ${plural(kids, "подкатегория", "подкатегории", "подкатегорий")}. Сначала удалите их или перенесите в другую категорию.`,
        confirmLabel: "Понятно",
      });
      return;
    }
    if (c.productCountDirect > 0) {
      await confirm({
        title: "Нельзя удалить",
        message: `В «${c.name}» лежит ${productsWord(c.productCountDirect)}. Перенесите их в другую категорию (мастер товара, шаг «Категория»), затем удалите.`,
        confirmLabel: "Понятно",
      });
      return;
    }
    const ok = await confirm({
      title: `Удалить «${c.name}»?`,
      message: `Страница /catalog/${c.slug} исчезнет с сайта вместе с характеристиками этой категории. Действие необратимо.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    setBusy(c.id);
    try {
      await adminApi.deleteCategory(c.id);
      push("Категория удалена", "ok");
      refresh();
    } catch (e) {
      const msg =
        e instanceof ApiError && e.code === "CATEGORY_HAS_PRODUCTS"
          ? "В категории есть товары — перенесите их и попробуйте снова"
          : e instanceof ApiError && e.code === "CATEGORY_HAS_CHILDREN"
            ? "У категории есть подкатегории — сначала удалите или перенесите их"
            : e instanceof ApiError
              ? e.message
              : "Не удалось удалить";
      push(msg, "error");
    } finally {
      setBusy(null);
    }
  }

  const moveOptions = useMemo(() => {
    if (!moving) return [];
    const roots = categories.filter((c) => !c.parentId && c.id !== moving.id && c.productCountDirect === 0).sort(byOrder);
    return [
      ...(moving.parentId ? [{ value: "", label: "— На верхний уровень (корневая) —" }] : []),
      ...roots.filter((r) => r.id !== moving.parentId).map((r) => ({ value: r.id, label: r.name })),
    ];
  }, [moving, categories]);

  const openNew = (parentId: string | null) => setDialog({ category: null, parentId });

  return (
    <div>
      <PageHeader
        title="Категории"
        subtitle="Дерево каталога, меню сайта и характеристики для фильтров"
        actions={
          <>
            <Button variant="outline" icon={<Layers className="h-4 w-4" />} onClick={() => setGroupsOpen(true)}>
              Группы характеристик
            </Button>
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openNew(null)}>
              Новая категория
            </Button>
          </>
        }
      />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка категорий…">
        {categories.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="Категорий пока нет"
            description="Создайте первую категорию — например, «Мыши». Подкатегории добавляются внутрь корневых."
            action={
              <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openNew(null)}>
                Новая категория
              </Button>
            }
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[220px] max-w-sm flex-1">
                <Input
                  aria-label="Поиск категории"
                  placeholder="Найти категорию…"
                  icon={<Search className="h-4 w-4" />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
                <span>
                  <b className="tabular text-[var(--text)]">{stats.roots}</b> корневых
                </span>
                <span>
                  <b className="tabular text-[var(--text)]">{stats.subs}</b> {plural(stats.subs, "подкатегория", "подкатегории", "подкатегорий")}
                </span>
                <span>
                  <b className="tabular text-[var(--text)]">{stats.products}</b> на витрине
                </span>
                {stats.hidden > 0 && (
                  <span>
                    <b className="tabular text-[var(--text)]">{stats.hidden}</b> скрыто из меню
                  </span>
                )}
              </div>
            </div>

            {visibleTree.length === 0 ? (
              <EmptyState icon={Search} title="Ничего не найдено" description="Проверьте написание или очистите поиск." />
            ) : (
              <motion.ul variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-2.5" aria-label="Дерево категорий">
                {visibleTree.map(({ cat, children }, ri) => {
                  const open = !collapsed.has(cat.id) || !!nq;
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
                            ? () =>
                                setCollapsed((p) => {
                                  const n = new Set(p);
                                  if (n.has(cat.id)) n.delete(cat.id);
                                  else n.add(cat.id);
                                  return n;
                                })
                            : undefined
                        }
                        first={tree.findIndex((n) => n.cat.id === cat.id) === 0}
                        last={tree.findIndex((n) => n.cat.id === cat.id) === allSiblings - 1}
                        busy={busy === cat.id}
                        reorderDisabled={!!nq}
                        onUp={() => move(cat, -1)}
                        onDown={() => move(cat, 1)}
                        onEdit={(tab) => setDialog({ category: cat, parentId: cat.parentId, tab })}
                        onAddChild={cat.productCountDirect === 0 ? () => openNew(cat.id) : undefined}
                        onMove={
                          childrenOf(categories, cat.id).length === 0
                            ? () => {
                                setMoving(cat);
                                setMoveTarget("");
                              }
                            : undefined
                        }
                        onDelete={() => remove(cat)}
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
                                    busy={busy === k.id}
                                    reorderDisabled={!!nq}
                                    onUp={() => move(k, -1)}
                                    onDown={() => move(k, 1)}
                                    onEdit={(tab) => setDialog({ category: k, parentId: k.parentId, tab })}
                                    onMove={() => {
                                      setMoving(k);
                                      setMoveTarget("");
                                    }}
                                    onDelete={() => remove(k)}
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
            )}
            <p className="mt-4 text-[12px] leading-relaxed text-[var(--text-faint)]">
              Товар лежит ровно в одной категории без подкатегорий. Страница родителя на сайте показывает товары всех его
              подкатегорий. «Уценка» — не категория, а состояние товара: подборка /catalog/utsenka собирается сама.
            </p>
          </>
        )}
      </QueryState>

      <CategoryDialog
        open={!!dialog}
        category={dialog?.category ? categories.find((c) => c.id === dialog.category!.id) ?? dialog.category : null}
        presetParentId={dialog?.parentId ?? null}
        categories={categories}
        initialTab={dialog?.tab ?? "main"}
        onClose={() => setDialog(null)}
        onSaved={() => refresh()}
      />

      <Modal
        open={!!moving}
        onClose={() => setMoving(null)}
        size="sm"
        title={`Переместить «${moving?.name ?? ""}»`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(null)}>
              Отмена
            </Button>
            <Button
              variant="accent"
              icon={<FolderInput className="h-4 w-4" />}
              disabled={moveOptions.length === 0 || (moveTarget === "" && !moveOptions.some((o) => o.value === ""))}
              onClick={doMove}
            >
              Переместить
            </Button>
          </>
        }
      >
        {moveOptions.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">
            Некуда перемещать: подходящих корневых категорий нет (в корень с товарами подкатегорию положить нельзя).
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <Select label="Куда" value={moveTarget} onChange={setMoveTarget} options={moveOptions} placeholder="Выберите родителя…" />
            <p className="text-[12px] leading-relaxed text-[var(--text-faint)]">
              Товары и адрес /catalog/{moving?.slug} не меняются. Характеристики нового родителя добавятся к её собственным.
              Корневые категории, в которых лежат товары, родителем стать не могут.
            </p>
          </div>
        )}
      </Modal>

      <GroupsDialog
        open={groupsOpen}
        groups={groupsQ.data ?? []}
        usedKeys={new Set((schemaQ.data?.attributes ?? []).map((a) => a.group))}
        onClose={() => setGroupsOpen(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["spec-groups"] });
          qc.invalidateQueries({ queryKey: ["catalog-schema"] });
        }}
      />
      {confirmUi}
    </div>
  );
}

function CategoryRow({
  c,
  depth,
  childCount,
  attrCount,
  expanded,
  onToggle,
  first,
  last,
  busy,
  reorderDisabled,
  onUp,
  onDown,
  onEdit,
  onAddChild,
  onMove,
  onDelete,
}: {
  c: AdminCategory;
  depth: 0 | 1;
  childCount: number;
  attrCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
  first: boolean;
  last: boolean;
  busy: boolean;
  reorderDisabled: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit: (tab?: "main" | "seo" | "specs") => void;
  onAddChild?: () => void;
  onMove?: () => void;
  onDelete: () => void;
  index?: number;
}) {
  const [menu, setMenu] = useState(false);
  const hidden = !c.showInMenu;
  const hasSeo = !!(c.seoTitle || c.seoDescription || c.h1 || c.introText);
  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 py-2.5 pr-2 transition-colors hover:bg-[var(--surface-hover)] sm:gap-3 sm:pr-3",
        depth === 0 ? "pl-2 sm:pl-3" : "pl-11 sm:pl-12",
        busy && "opacity-60"
      )}
    >
      {depth === 1 && (
        <CornerDownRight aria-hidden className="absolute left-[21px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-faint)]" />
      )}
      {depth === 0 &&
        (onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Свернуть подкатегории" : "Развернуть подкатегории"}
            aria-expanded={expanded}
            className="focusable grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center text-[var(--text-faint)]" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--line-strong)]" />
          </span>
        ))}

      <button
        type="button"
        onClick={() => onEdit()}
        className="focusable flex min-w-0 flex-1 flex-col items-start rounded-[var(--r-sm)] text-left"
      >
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("truncate font-semibold", depth === 0 ? "text-[15px] text-[var(--ink)]" : "text-[14px] text-[var(--text)]")}>
            {c.name}
          </span>
          {hidden && (
            <Badge tone="neutral" className="shrink-0 px-1.5">
              <EyeOff className="h-3 w-3" /> скрыта из меню
            </Badge>
          )}
          {hasSeo && (
            <Badge tone="info" className="shrink-0 px-1.5">
              SEO
            </Badge>
          )}
        </span>
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 text-[12px] text-[var(--text-faint)]">
          <span className="truncate font-mono">/catalog/{c.slug}</span>
          {c.artKind && <span className="hidden sm:inline">· плитка {c.artKind}</span>}
        </span>
      </button>

      <div className="hidden shrink-0 flex-col items-end text-right md:flex">
        <span className="tabular text-[13px] font-semibold text-[var(--text)]" title="Активных товаров в категории и подкатегориях">
          {c.productCount} на витрине
        </span>
        <span className="text-[11.5px] text-[var(--text-faint)]">
          {childCount > 0
            ? `${childCount} ${plural(childCount, "подкатегория", "подкатегории", "подкатегорий")}`
            : `${productsWord(c.productCountDirect)} всего`}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onEdit("specs")}
        title="Характеристики категории"
        className="focusable hidden shrink-0 items-center gap-1 rounded-[var(--r-sm)] px-2 py-1 text-[12px] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] lg:inline-flex"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="tabular">{attrCount ?? 0}</span>
      </button>
      <span className="tabular shrink-0 text-[12px] font-semibold text-[var(--text-muted)] md:hidden" title="На витрине">{c.productCount}</span>

      <div className="flex shrink-0 items-center gap-0.5">
        <Act label="Выше" disabled={first || reorderDisabled || busy} onClick={onUp}>
          <ArrowUp className="h-4 w-4" />
        </Act>
        <Act label="Ниже" disabled={last || reorderDisabled || busy} onClick={onDown}>
          <ArrowDown className="h-4 w-4" />
        </Act>
        <div className="relative">
          <Act label="Действия" onClick={() => setMenu((v) => !v)} expanded={menu}>
            <MoreHorizontal className="h-4 w-4" />
          </Act>
          <AnimatePresence>
            {menu && (
              <RowMenu onClose={() => setMenu(false)}>
                <MenuItem icon={Pencil} onClick={() => (setMenu(false), onEdit())}>
                  Изменить
                </MenuItem>
                <MenuItem icon={SlidersHorizontal} onClick={() => (setMenu(false), onEdit("specs"))}>
                  Характеристики
                </MenuItem>
                {onAddChild && (
                  <MenuItem icon={FolderPlus} onClick={() => (setMenu(false), onAddChild())}>
                    Добавить подкатегорию
                  </MenuItem>
                )}
                {onMove && (
                  <MenuItem icon={FolderInput} onClick={() => (setMenu(false), onMove())}>
                    Переместить в…
                  </MenuItem>
                )}
                <MenuItem icon={Trash2} danger onClick={() => (setMenu(false), onDelete())}>
                  Удалить
                </MenuItem>
              </RowMenu>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Act({
  label,
  onClick,
  disabled,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className="focusable grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors enabled:hover:bg-[var(--surface-3)] enabled:hover:text-[var(--text)] disabled:opacity-25 pointer-coarse:h-10 pointer-coarse:w-10"
    >
      {children}
    </button>
  );
}

function RowMenu({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-row-menu]")) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => document.addEventListener("mousedown", close));
    document.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <motion.div
      data-row-menu
      role="menu"
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.12 }}
      className="elevated absolute right-0 top-9 z-30 w-56 p-1"
    >
      {children}
    </motion.div>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  danger,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 py-2 text-left text-[13.5px] font-medium transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-none",
        danger ? "text-[var(--danger-ink)]" : "text-[var(--text)]"
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      {children}
    </button>
  );
}
