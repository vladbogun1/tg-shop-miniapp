"use client";

/** Tags (route "/tags") — list + create + rename + delete. Neo-brutalism restyle. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Pencil, Trash2, Check, X, Tag as TagIcon } from "lucide-react";
import { adminApi, ApiError, type ProductTag } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { CenterSpinner } from "@/components/ui/Spinner";
import { staggerContainer, riseItem, hoverLift } from "@/lib/motion";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/cn";

export default function TagsPage() {
  const qc = useQueryClient();
  const { push } = useToast();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ProductTag | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags"],
    queryFn: () => adminApi.tags(),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tags"] });

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
    await wrap(adminApi.createTag(newName.trim())).then(() => {
      setNewName("");
      setCreating(false);
      push("Тег создан", "ok");
    });
  }

  async function rename(t: ProductTag) {
    if (!editName.trim()) return;
    await wrap(adminApi.renameTag(t.id, editName.trim())).then(() => {
      setEditId(null);
      push("Тег переименован", "ok");
    });
  }

  async function remove(t: ProductTag) {
    await wrap(adminApi.deleteTag(t.id)).then(() => {
      setPendingDelete(null);
      push("Тег удалён", "ok");
    });
  }

  function openCreate() {
    setNewName("");
    setCreating(true);
  }

  function startEdit(t: ProductTag) {
    setEditId(t.id);
    setEditName(t.name);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <PageHeader
        title="Теги"
        subtitle="Метки для группировки товаров"
        actions={
          <Button
            variant="accent"
            icon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
          >
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
              />
              <Button
                variant="accent"
                loading={busy}
                icon={<Check className="h-4 w-4" />}
                onClick={create}
              >
                Добавить
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCreating(false)}
                aria-label="Отмена"
              >
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
            <Button
              variant="accent"
              icon={<Plus className="h-4 w-4" />}
              onClick={openCreate}
            >
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
              const editing = editId === t.id;
              return (
                <motion.div
                  key={t.id}
                  layout
                  variants={riseItem}
                  exit="exit"
                  {...(editing ? {} : hoverLift)}
                  className={cn(
                    "card group relative flex items-center gap-2 px-4 py-3",
                    editing && "bg-[var(--accent-soft)]"
                  )}
                >
                  {editing ? (
                    <>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]">
                        <TagIcon className="h-4 w-4" />
                      </span>
                      <input
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") rename(t);
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-[var(--text)] outline-none"
                      />
                      <button
                        onClick={() => rename(t)}
                        disabled={busy}
                        aria-label="Сохранить"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--ok)] transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        aria-label="Отмена"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--c3)] text-[var(--accent-ink)]">
                        <TagIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[var(--text)]">
                        {t.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          onClick={() => startEdit(t)}
                          aria-label="Переименовать"
                          className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setPendingDelete(t)}
                          aria-label="Удалить"
                          className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] hover:text-[var(--danger)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

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
          Тег{" "}
          <span className="font-semibold text-[var(--text)]">
            {pendingDelete?.name}
          </span>{" "}
          будет удалён и снят со всех товаров. Действие необратимо.
        </p>
      </Modal>
    </motion.div>
  );
}
