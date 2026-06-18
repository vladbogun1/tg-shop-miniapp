"use client";

/**
 * Promocodes (route "/promocodes") — list + create/edit (code, discountPercent,
 * discountAmountMinor, maxUses, active) + delete.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { adminApi, ApiError, type PromoCode } from "@/lib/api";
import { money, toMajor, toMinor } from "@/lib/money";
import { Modal } from "@/components/ui/Modal";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassToggle } from "@/components/ui/GlassToggle";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/lib/toast";

export default function PromocodesPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);

  const { data: promos = [], isLoading } = useQuery({
    queryKey: ["promocodes"],
    queryFn: () => adminApi.promocodes(),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["promocodes"] });

  // form state
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [amountMajor, setAmountMajor] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? "");
    setPercent(editing?.discountPercent ? String(editing.discountPercent) : "");
    setAmountMajor(editing?.discountAmountMinor ? String(toMajor(editing.discountAmountMinor)) : "");
    setMaxUses(editing?.maxUses ? String(editing.maxUses) : "");
    setActive(editing?.active ?? true);
  }, [open, editing]);

  async function save() {
    if (!code.trim()) {
      push("Укажите код", "error");
      return;
    }
    const body: Partial<PromoCode> = {
      code: code.trim().toUpperCase(),
      discountPercent: percent ? Number(percent) : null,
      discountAmountMinor: amountMajor ? toMinor(amountMajor) : null,
      maxUses: maxUses ? Number(maxUses) : null,
      active,
    };
    setSaving(true);
    try {
      if (editing) await adminApi.updatePromo(editing.id, body);
      else await adminApi.createPromo(body);
      push("Сохранено", "ok");
      refresh();
      setOpen(false);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: PromoCode) {
    try {
      await adminApi.deletePromo(p.id);
      refresh();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[20px] font-bold text-[var(--text)]">Промокоды</h1>
        <GlassButton
          variant="accent"
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Создать
        </GlassButton>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : promos.length === 0 ? (
        <div className="glass rounded-[var(--r-md)] px-4 py-10 text-center text-[var(--text-faint)]">
          Промокодов нет
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {promos.map((p) => (
            <div key={p.id} className="glass flex items-center gap-3 rounded-[var(--r-md)] px-4 py-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[15px] font-bold text-[var(--text)]">{p.code}</span>
                  <Badge color={p.active ? "var(--ok)" : "var(--text-faint)"}>
                    {p.active ? "активен" : "выкл"}
                  </Badge>
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  {p.discountPercent ? `−${p.discountPercent}%` : ""}
                  {p.discountAmountMinor ? `−${money(p.discountAmountMinor)}` : ""}
                  {p.maxUses ? ` · лимит ${p.usedCount ?? 0}/${p.maxUses}` : ""}
                </div>
              </div>
              <button
                onClick={() => {
                  setEditing(p);
                  setOpen(true);
                }}
                className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(p)}
                className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--danger)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Редактировать промокод" : "Новый промокод"}
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </GlassButton>
            <GlassButton variant="accent" loading={saving} onClick={save}>
              Сохранить
            </GlassButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <GlassInput label="Код" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <div className="grid grid-cols-2 gap-3">
            <GlassInput
              label="Скидка %"
              inputMode="numeric"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
            <GlassInput
              label="Скидка (UAH)"
              inputMode="decimal"
              value={amountMajor}
              onChange={(e) => setAmountMajor(e.target.value)}
            />
          </div>
          <p className="-mt-2 text-[12px] text-[var(--text-faint)]">
            Фикс. скидка приоритетнее процентной (см. контракт).
          </p>
          <GlassInput
            label="Макс. использований (пусто = без лимита)"
            inputMode="numeric"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
          <GlassToggle checked={active} onChange={setActive} label="Активен" />
        </div>
      </Modal>
    </div>
  );
}
