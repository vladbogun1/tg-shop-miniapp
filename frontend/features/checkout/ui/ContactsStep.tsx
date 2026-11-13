"use client";

import { formatPhone } from "@shop/core/phone";
import type { OrderField } from "@shop/customer/checkout/order-request";
import { namePartShown, recipientErrors, type Recipient } from "@shop/customer/delivery/recipient";
import { Input } from "@shop/ui/primitives";
import { useCheckoutT } from "@/i18n/checkout";

/** Step 1: the recipient as in the passport (the parcel is handed out by it) and the phone. */
export function ContactsStep({
  recipient,
  onRecipient,
  phone,
  touched,
  phoneOk,
  onPhone,
  prefilled,
  serverField,
}: {
  recipient: Recipient;
  onRecipient: (r: Recipient) => void;
  phone: string;
  touched: boolean;
  phoneOk: boolean;
  onPhone: (v: string) => void;
  /** Recipient / phone came from the last order. */
  prefilled: boolean;
  /** The server rejected this field (validation) although the client check passed. */
  serverField?: OrderField | null;
}) {
  const t = useCheckoutT();
  const err = recipientErrors(recipient);
  const serverName = serverField === "name";
  const phoneBad = (touched && !phoneOk) || serverField === "phone";
  const set = (patch: Partial<Recipient>) => onRecipient({ ...recipient, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <p className="px-0.5 text-[13px] text-[var(--muted)]">{t("checkout.contacts.intro")}</p>
      {prefilled && <p className="-mt-2 px-0.5 text-[12px] font-semibold text-[var(--ok)]">{t("checkout.prefilled")}</p>}
      <h3 className="eyebrow -mb-1 px-0.5 !text-[10px] !tracking-[0.2em]">{t("delivery.recipient.title")}</h3>
      <NameInput
        label={t("delivery.recipient.lastName")}
        value={recipient.lastName}
        onChange={(v) => set({ lastName: v })}
        invalid={err.lastName}
        bad={namePartShown(err, "lastName", touched, serverName)}
        error={t(err.latin.lastName ? "delivery.recipient.latinError" : "delivery.recipient.lastNameError")}
        autoComplete="family-name"
      />
      <NameInput
        label={t("delivery.recipient.firstName")}
        value={recipient.firstName}
        onChange={(v) => set({ firstName: v })}
        invalid={err.firstName}
        bad={namePartShown(err, "firstName", touched, serverName)}
        error={t(err.latin.firstName ? "delivery.recipient.latinError" : "delivery.recipient.firstNameError")}
        autoComplete="given-name"
      />
      <NameInput
        label={t("delivery.recipient.middleName")}
        value={recipient.middleName}
        onChange={(v) => set({ middleName: v })}
        bad={err.middleName}
        error={t("delivery.recipient.latinError")}
        autoComplete="additional-name"
      />
      <p className="-mt-2 px-0.5 text-[12px] font-medium text-[var(--muted)]">{t("delivery.recipient.hint")}</p>
      <Input
        label={t("checkout.contacts.phone")}
        inputMode="tel"
        value={formatPhone(phone)}
        onChange={(e) => onPhone(e.target.value)}
        status={phoneBad ? "danger" : phoneOk ? "ok" : undefined}
        hint={phoneBad ? t("checkout.contacts.phoneError") : undefined}
        autoComplete="tel"
      />
    </div>
  );
}

/** A part of the name. `invalid` — not filled yet (no «ok»), `bad` — show the error. The optional part has neither. */
function NameInput(p: { label: string; value: string; onChange: (v: string) => void; invalid?: boolean; bad?: boolean; error?: string; autoComplete: string }) {
  const required = p.invalid !== undefined;
  return (
    <Input
      label={p.label}
      value={p.value}
      onChange={(e) => p.onChange(e.target.value)}
      status={p.bad ? "danger" : required && !p.invalid ? "ok" : undefined}
      hint={p.bad ? p.error : undefined}
      autoComplete={p.autoComplete}
      maxLength={64}
    />
  );
}
