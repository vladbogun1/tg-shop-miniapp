import { formatPhone } from "@shop/core/phone";
import type { OrderField } from "@shop/customer/checkout/order-request";
import { namePartShown, recipientErrors, type Recipient } from "@shop/customer/delivery/recipient";
import { Input } from "@shop/ui/primitives";
import { useCheckoutT } from "@/i18n/checkout";
import { Section } from "./parts";

interface Props {
  recipient: Recipient;
  onRecipient: (r: Recipient) => void;
  phone: string;
  onPhone: (v: string) => void;
  phoneOk: boolean;
  /** The submit was attempted: show validation. */
  touched: boolean;
  prefilled: boolean;
  /** The server rejected this field (validation) although the client check passed. */
  serverField?: OrderField | null;
  /** Pickup: no waybill, Latin letters are fine. */
  latinAllowed?: boolean;
}

/** Получатель как в паспорте (прізвище, ім'я, по батькові — по ним выдают посылку) и телефон. */
export function ContactsSection({ recipient, onRecipient, phone, onPhone, phoneOk, touched, prefilled, serverField, latinAllowed }: Props) {
  const t = useCheckoutT();
  const err = recipientErrors(recipient, latinAllowed);
  const serverName = serverField === "name";
  const phoneBad = (touched && !phoneOk) || serverField === "phone";
  const set = (patch: Partial<Recipient>) => onRecipient({ ...recipient, ...patch });
  return (
    <Section id="co-contacts" n={1} title={t("checkout.contacts")}>
      {prefilled && <p className="mb-3 text-[13px] font-medium text-[var(--ok)]">{t("checkout.prefilled")}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
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
        <Input
          label={t("checkout.phone")}
          inputMode="tel"
          value={phone ? formatPhone(phone) : ""}
          onFocus={() => {
            if (!phone) onPhone("+38");
          }}
          onChange={(e) => onPhone(e.target.value)}
          status={phoneBad ? "danger" : phoneOk ? "ok" : undefined}
          hint={phoneBad ? t("checkout.phoneError") : undefined}
          autoComplete="tel"
          name="tel"
          aria-invalid={phoneBad}
        />
      </div>
      <p className="mt-3 text-[13px] font-medium text-[var(--muted)]">{t("delivery.recipient.hint")}</p>
    </Section>
  );
}

/** Часть ФИО. `invalid` — не заполнено (без «ок»), `bad` — показать ошибку. Необязательное поле — без обоих. */
function NameInput(p: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  bad?: boolean;
  error?: string;
  autoComplete: string;
}) {
  const required = p.invalid !== undefined;
  return (
    <Input
      label={p.label}
      value={p.value}
      onChange={(e) => p.onChange(e.target.value)}
      status={p.bad ? "danger" : required && !p.invalid ? "ok" : undefined}
      hint={p.bad ? p.error : undefined}
      autoComplete={p.autoComplete}
      name={p.autoComplete}
      maxLength={64}
      aria-invalid={p.bad}
    />
  );
}
