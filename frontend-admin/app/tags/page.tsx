"use client";

/**
 * Tags (route "/tags") — list + create + edit + delete. Neo-brutalism.
 * A tag is also a category of the public site: besides the name it has the URL slug
 * (/catalog/<slug>, blank = generated from the name), the position in the site menu and
 * whether it shows there at all. The list is in menu order.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Pencil, Trash2, Check, X, Tag as TagIcon, EyeOff } from "lucide-react";
import { adminApi, ApiError, type AdminTag } from "@/lib/api";
import { slugify } from "@/lib/slug";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CenterSpinner } from "@/components/ui/Spinner";
import { staggerContainer, riseItem, hoverLift } from "@/lib/motion";
import { useToast } from "@/lib/toast";

interface EditState {
  tag: AdminTag;
  name: string;
  slug: string;
  sortOrder: string;
  showInMenu: boolean;
}

export default function TagsPage() {
  const qc = useQueryClient();
  const { push } = useToast();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminTag | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: rawTags = [], isLoading } = useQuery({
    queryKey: ["tags"],
    queryFn: () => adminApi.tags(),
  });
  // Same order as the site's category menu: position, then name.
  const tags = useMemo(
    () =>
      rawTags
        .slice()
        .sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "ru")
        ),
    [rawTags]
  );
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tags"] });
    // Product cards show their tags; keep them in step after a rename.
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  function wrap<T>(p: Promise<T>) {
    setBusy(true);
    return p
      .then((r) => {
        refresh();
        return r;
      })
      .catch((e) => {
        push(e instanceof ApiError ? e.message : "Ошибка", "error");
        throw e;
      })
      .finally(() => setBusy(false));
  }

  async function create() {
    if (!newName.trim()) return;
    const nextOrder = tags.reduce((m, t) => Math.max(m, t.sortOrder ?? 0), 0) + 10;
    await wrap(adminApi.createTag({ name: newName.trim(), sortOrder: nextOrder })).then(() => {
      setNewName("");
      setCreating(false);
      push("Тег создан", "ok");
    });
  }

  async function save() {
    if (!editing || !editing.name.trim()) return;
    const order = Number.parseInt(editing.sortOrder, 10);
    await wrap(
      adminApi.updateTag(editing.tag.id, {
        name: editing.name.trim(),
        slug: editing.slug.trim(),
        sortOrder: Number.isFinite(order) ? order : 0,
        showInMenu: editing.showInMenu,
      })
    ).then(() => {
      setEditing(null);
      push("Тег сохранён", "ok");
    });
  }

  async function remove(t: AdminTag) {
    await wrap(adminApi.deleteTag(t.id)).then(() => {
      setPendingDelete(null);
      push("Тег удалён", "ok");
    });
  }

  function openCreate() {
    setNewName("");
    setCreating(true);
  }

  function startEdit(t: AdminTag) {
    setEditing({
      tag: t,
      name: t.name,
      slug: t.slug ?? "",
      sortOrder: String(t.sortOrder ?? 0),
      showInMenu: t.showInMenu ?? true,
    });
  }

  const editSlugPreview = editing ? slugify(editing.slug.trim() || editing.name) : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <PageHeader
        title="Теги"
        subtitle="Метки товаров и категории меню сайта"
        actions={
          <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Новый тег
          </Button>
        }
      />

      {/* Inline create panel */}
      <AnimatePresence initial={false}>
        {creating && (
          <motion.div
            key="create"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="card mb-5 flex items-end gap-2 p-4">
              <Input
                label="Название тега"
                className="flex-1"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="например, Новинки"
                hint={newName.trim() ? `Адрес на сайте: /catalog/${slugify(newName) || "…"}` : undefined}
              />
              <Button variant="accent" loading={busy} icon={<Check className="h-4 w-4" />} onClick={create}>
                Добавить
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCreating(false)} aria-label="Отмена">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <CenterSpinner label="Загрузка тегов…" />
      ) : tags.length === 0 ? (
        <EmptyState
          icon={TagIcon}
          title="Тегов пока нет"
          description="Создайте первый тег, чтобы группировать товары."
          action={
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Новый тег
            </Button>
          }
        />
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {tags.map((t) => {
              const hidden = t.showInMenu === false;
              return (
                <motion.div
                  key={t.id}
                  layout
                  variants={riseItem}
                  exit="exit"
                  {...hoverLift}
                  className="card group relative flex items-center gap-2 px-4 py-3"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--c3)] text-[13px] font-black text-[var(--accent-ink)]">
                    {t.sortOrder ? t.sortOrder : <TagIcon className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[14px] font-bold text-[var(--text)]">{t.name}</span>
                      {hidden && (
                        <Badge tone="neutral" className="shrink-0 px-1.5">
                          <EyeOff className="h-3 w-3" /> не в меню
                        </Badge>
                      )}
                    </div>
                    {t.slug && (
                      <div className="truncate font-mono text-[11px] text-[var(--text-faint)]">
                        /catalog/{t.slug}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <button
                      onClick={() => startEdit(t)}
                      aria-label="Изменить"
                      className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] pointer-coarse:h-11 pointer-coarse:w-11"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(t)}
                      aria-label="Удалить"
                      className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] hover:text-[var(--danger)] pointer-coarse:h-11 pointer-coarse:w-11"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Edit */}
      <Modal
        open={!!editing}
        onClose={() => (busy ? undefined : setEditing(null))}
        title="Тег / категория"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
              Отмена
            </Button>
            <Button
              variant="accent"
              loading={busy}
              icon={<Check className="h-4 w-4" />}
              onClick={save}
              disabled={!editing?.name.trim()}
            >
              Сохранить
            </Button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Input
              label="Название"
              autoFocus
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
            <Input
              label="Адрес на сайте (slug)"
              value={editing.slug}
              onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
              placeholder={slugify(editing.name) || "из названия"}
              hint={
                editing.slug.trim()
                  ? `Страница: /catalog/${editSlugPreview || "…"}`
                  : `Пусто — сгенерируется из названия: /catalog/${editSlugPreview || "…"}`
              }
            />
            <Input
              label="Порядок в меню"
              inputMode="numeric"
              value={editing.sortOrder}
              onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value.replace(/[^\d-]/g, "") })}
              hint="Меньше — левее/выше. При равных — по алфавиту."
            />
            <div className="rounded-[var(--r-md)] border-2 border-[var(--border-2)] bg-[var(--surface-2)] p-3">
              <Toggle
                checked={editing.showInMenu}
                onChange={(v) => setEditing({ ...editing, showInMenu: v })}
                label="Показывать в меню сайта"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!pendingDelete}
        onClose={() => (busy ? undefined : setPendingDelete(null))}
        title="Удалить тег?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={busy}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={busy}
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => pendingDelete && remove(pendingDelete)}
            >
              Удалить
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
          Тег <span className="font-semibold text-[var(--text)]">{pendingDelete?.name}</span> будет
          удалён и снят со всех товаров, а его страница на сайте исчезнет. Действие необратимо.
        </p>
      </Modal>
    </motion.div>
  );
}
