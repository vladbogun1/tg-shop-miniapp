import { formatPhone } from "@shop/core/phone";
import { Input } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import { Section } from "./parts";

interface Props {
  name: string;
  phone: string;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  nameOk: boolean;
  phoneOk: boolean;
  /** The submit was attempted: show validation. */
  touched: boolean;
  prefilled: boolean;
  /** The server rejected this field (validation) although the client check passed. */
  serverField?: "name" | "phone" | "comment" | null;
}

export function ContactsSection({ name, phone, onName, onPhone, nameOk, phoneOk, touched, prefilled, serverField }: Props) {
  const { t } = useI18n();
  const nameBad = (touched && !nameOk) || serverField === "name";
  const phoneBad = (touched && !phoneOk) || serverField === "phone";
  return (
    <Section id="co-contacts" n={1} title={t("checkout.contacts")}>
      {prefilled && <p className="mb-3 text-[13px] font-medium text-[var(--ok)]">{t("checkout.prefilled")}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t("checkout.name")}
          value={name}
          onChange={(e) => onName(e.target.value)}
          status={nameBad ? "danger" : nameOk ? "ok" : undefined}
          hint={nameBad ? t("checkout.nameError") : undefined}
          autoComplete="name"
          name="name"
          aria-invalid={nameBad}
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
    </Section>
  );
}
