"use client";

import { formatPhone } from "@shop/core/phone";
import { Input } from "@shop/ui/primitives";
import { useT } from "@/i18n/context";

export function ContactsStep({
  name,
  phone,
  touched,
  nameOk,
  phoneOk,
  onName,
  onPhone,
  prefilled,
}: {
  name: string;
  phone: string;
  touched: boolean;
  nameOk: boolean;
  phoneOk: boolean;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  /** Name / phone came from the last order. */
  prefilled: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <p className="px-0.5 text-[13px] text-[var(--muted)]">
        {t("checkout.contacts.intro")}
      </p>
      {prefilled && (
        <p className="-mt-2 px-0.5 text-[12px] font-semibold text-[var(--ok)]">{t("checkout.prefilled")}</p>
      )}
      <Input
        label={t("checkout.contacts.name")}
        value={name}
        onChange={(e) => onName(e.target.value)}
        status={touched && !nameOk ? "danger" : nameOk ? "ok" : undefined}
        hint={touched && !nameOk ? t("checkout.contacts.nameError") : undefined}
        autoComplete="name"
      />
      <Input
        label={t("checkout.contacts.phone")}
        inputMode="tel"
        value={formatPhone(phone)}
        onChange={(e) => onPhone(e.target.value)}
        status={touched && !phoneOk ? "danger" : phoneOk ? "ok" : undefined}
        hint={
          touched && !phoneOk
            ? t("checkout.contacts.phoneError")
            : undefined
        }
        autoComplete="tel"
      />
    </div>
  );
}
