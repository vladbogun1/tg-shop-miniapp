"use client";

/**
 * Promocodes (route "/promocodes") — list + create/edit (code, discountPercent,
 * discountAmountMinor, maxUses, active) + delete. Neo-brutalism restyle — visuals
 * only, functionality + API calls preserved 1:1 with the original.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Pencil, Trash2, Ticket, Percent, Wallet } from "lucide-react";
import { adminApi, ApiError, type PromoCode } from "@/lib/api";
import { money, toMajor, toMinor } from "@/lib/money";
import { PageHeader } from "@/components/layout/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CenterSpinner } from "@/components/ui/Spinner";
import { staggerContainer, riseItem, hoverLift } from "@/lib/motion";
import { useToast } from "@/lib/toast";

export default function PromocodesPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [confirming, setConfirming] = useState<PromoCode | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setAmountMajor(
      editing?.discountAmountMinor ? String(toMajor(editing.discountAmountMinor)) : ""
    );
    setMaxUses(editing?.maxUses ? String(editing.maxUses) : "");
    setActive(editing?.active ?? true);
  }, [open, editing]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(p: PromoCode) {
    setEditing(p);
    setOpen(true);
  }

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
    setDeleting(true);
    try {
      await adminApi.deletePromo(p.id);
      push("Промокод удалён", "ok");
      refresh();
      setConfirming(null);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Промокоды"
        subtitle="Скидки для клиентов — процент или фиксированная сумма"
        actions={
          <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Новый промокод
          </Button>
        }
      />

      {isLoading ? (
        <CenterSpinner label="Загрузка промокодов" />
      ) : promos.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="Промокодов пока нет"
          description="Создайте первый промокод, чтобы предлагать клиентам скидки на заказы."
          action={
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Новый промокод
            </Button>
          }
        />
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="flex flex-col gap-3"
        >
          {promos.map((p) => {
            const limited = !!p.maxUses;
            const used = p.usedCount ?? 0;
            const exhausted = limited && used >= (p.maxUses ?? 0);
            return (
              <motion.div
                key={p.id}
                variants={riseItem}
                {...hoverLift}
                className="card flex items-center gap-4 px-4 py-3.5"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border-2 border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]">
                  <Ticket className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[15px] font-black tracking-wide text-[var(--text)]">
                      {p.code}
                    </span>
                    <Badge tone={p.active ? "ok" : "neutral"} dot>
                      {p.active ? "активен" : "выключен"}
                    </Badge>
                    {exhausted && <Badge tone="warn">лимит исчерпан</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
                    {p.discountPercent ? (
                      <span className="inline-flex items-center gap-1">
                        <Percent className="h-3.5 w-3.5 text-[var(--text-faint)]" />
                        {p.discountPercent}% скидка
                      </span>
                    ) : null}
                    {p.discountAmountMinor ? (
                      <span className="inline-flex items-center gap-1">
                        <Wallet className="h-3.5 w-3.5 text-[var(--text-faint)]" />
                        −{money(p.discountAmountMinor)}
                      </span>
                    ) : null}
                    <span className="text-[var(--text-faint)]">
                      {limited ? `Использовано ${used} / ${p.maxUses}` : `Использовано ${used} · без лимита`}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Редактировать"
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Удалить"
                    className="hover:text-[var(--danger)]"
                    onClick={() => setConfirming(p)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* create / edit */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Редактировать промокод" : "Новый промокод"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button variant="accent" loading={saving} onClick={save}>
              Сохранить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Код"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SUMMER25"
            className="font-mono tracking-wide"
            icon={<Ticket className="h-4 w-4" />}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Скидка %"
              inputMode="numeric"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              icon={<Percent className="h-4 w-4" />}
            />
            <Input
              label="Скидка (UAH)"
              inputMode="decimal"
              value={amountMajor}
              onChange={(e) => setAmountMajor(e.target.value)}
              icon={<Wallet className="h-4 w-4" />}
            />
          </div>
          <p className="-mt-2 text-[12px] text-[var(--text-faint)]">
            Фикс. скидка приоритетнее процентной (см. контракт).
          </p>
          <Input
            label="Макс. использований"
            hint="Пусто = без лимита"
            inputMode="numeric"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
          <div className="card-2 rounded-[var(--r-md)] px-3.5 py-3">
            <Toggle checked={active} onChange={setActive} label="Активен" />
          </div>
        </div>
      </Modal>

      {/* delete confirm */}
      <Modal
        open={!!confirming}
        onClose={() => (deleting ? undefined : setConfirming(null))}
        title="Удалить промокод?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirming(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() => confirming && remove(confirming)}
            >
              Удалить
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
          Промокод{" "}
          <AnimatePresence mode="wait">
            <motion.span
              key={confirming?.id ?? "none"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-mono font-bold text-[var(--text)]"
            >
              {confirming?.code}
            </motion.span>
          </AnimatePresence>{" "}
          будет удалён без возможности восстановления.
        </p>
      </Modal>
    </div>
  );
}
