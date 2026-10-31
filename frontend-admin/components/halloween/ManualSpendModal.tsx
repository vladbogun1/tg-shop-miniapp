"use client";

/**
 * «Добавить вручную»: a customer whose purchases are older than the shop database. The typed money adds to
 * what the shop knows before the event; from the earlier-customer threshold up the person is in the
 * purchase draw (the event service checks the rule and says why not). Editing a person = same form, prefilled.
 */
import { useState } from "react";
import { hwApi, type HwMember } from "@/lib/halloween-api";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function ManualSpendModal({ member, minSpendMinor, onClose, onSaved }: {
  /** null = a new person; a member = edit their typed amount. */
  member: HwMember | null;
  minSpendMinor: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const [who, setWho] = useState(member ? (member.username ? `@${member.username}` : member.tgId) : "");
  const [spend, setSpend] = useState(member?.manualSpendMinor ? String(Math.round(member.manualSpendMinor / 100)) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      push(await action(), "ok");
      onSaved();
    } catch (e) {
      push(e instanceof Error ? e.message : "Не получилось", "error");
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(async () => {
    const r = await hwApi.addManual(who.trim(), Number(spend), note.trim());
    const name = r.name || (r.username ? `@${r.username}` : r.tgId);
    return `${name}: до акции ${money(r.oldSpendMinor)} (в базе ${money(r.shopMinor)} + вручную ${money(r.manualMinor)}), в розыгрыше покупок`;
  });
  const remove = () => run(async () => {
    await hwApi.removeManual(member!.tgId);
    return "Ручная сумма убрана";
  });

  return (
    <Modal open onClose={onClose} size="sm" closeOnBackdrop={false}
      title={member ? "Сумма до базы" : "Добавить в розыгрыш покупок"}
      footer={<>
        {member?.manualSpendMinor ? <Button variant="ghost" disabled={busy} onClick={remove}>Убрать</Button> : null}
        <ModalCancel disabled={busy} />
        <Button variant="accent" loading={busy} disabled={!who.trim() || !(Number(spend) > 0)} onClick={save}>Сохранить</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-[var(--text-muted)]">
          Для тех, кто покупал у нас ещё до общей базы. Сумма прибавится к его заказам до акции; от {money(minSpendMinor)} он
          становится постоянным покупателем и сразу участвует в розыгрыше покупок (1 билет, новые заказы добавляют ещё).
        </p>
        <Input label="Telegram ID или @ник" value={who} disabled={Boolean(member)} onChange={(e) => setWho(e.target.value)}
          hint="Человек должен хотя бы раз зайти в магазин или Mini App" />
        <Input label="Потратил до базы, ₴" inputMode="numeric" value={spend} onChange={(e) => setSpend(e.target.value.replace(/\D/g, ""))} />
        <Input label="Заметка (необязательно)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
