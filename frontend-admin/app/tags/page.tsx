"use client";

/** Tags (route "/tags") — list + create + rename + delete. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { adminApi, ApiError, type ProductTag } from "@/lib/api";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/lib/toast";

export default function TagsPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
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
    await wrap(adminApi.createTag(newName.trim())).then(() => setNewName(""));
  }
  async function rename(t: ProductTag) {
    if (!editName.trim()) return;
    await wrap(adminApi.renameTag(t.id, editName.trim())).then(() => setEditId(null));
  }
  async function remove(t: ProductTag) {
    await wrap(adminApi.deleteTag(t.id));
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-5 text-[20px] font-bold text-[var(--text)]">Теги</h1>

      <div className="mb-5 flex items-end gap-2">
        <GlassInput
          label="Новый тег"
          className="flex-1"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <GlassButton variant="accent" loading={busy} icon={<Plus className="h-4 w-4" />} onClick={create}>
          Добавить
        </GlassButton>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tags.length === 0 && (
            <div className="glass rounded-[var(--r-md)] px-4 py-10 text-center text-[var(--text-faint)]">
              Тегов нет
            </div>
          )}
          {tags.map((t) => (
            <div key={t.id} className="glass flex items-center gap-2 rounded-[var(--r-md)] px-4 py-2.5">
              {editId === t.id ? (
                <>
                  <input
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && rename(t)}
                    className="flex-1 bg-transparent text-[14px] text-[var(--text)] outline-none"
                  />
                  <button onClick={() => rename(t)} className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--ok)] hover:bg-white/10">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditId(null)} className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10">
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-[14px] text-[var(--text)]">{t.name}</span>
                  <button
                    onClick={() => {
                      setEditId(t.id);
                      setEditName(t.name);
                    }}
                    className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(t)}
                    className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--danger)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
