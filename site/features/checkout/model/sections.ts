/** The section id to scroll to when the form cannot be submitted: contacts, then delivery, then payment. */
export function firstInvalidSection(v: { nameOk: boolean; phoneOk: boolean; deliveryOk: boolean }): string {
  if (!v.nameOk || !v.phoneOk) return "co-contacts";
  return v.deliveryOk ? "co-payment" : "co-delivery";
}
