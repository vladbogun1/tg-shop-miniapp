/**
 * Writes of the «Переводы» screen: «Принять» of one text and the bulk accept. Thin wrappers over
 * /import and /accept that report what did not go through in the admin's words.
 */
import { adminApi, type TrAcceptItem, type TrLocale } from "@/lib/api";
import type { UniqueString } from "@/lib/translation-check";
import { planAccept } from "@/lib/translation-queue";

export interface AcceptOutcome {
  /** Fields × languages written or accepted. */
  done: number;
  /** The original changed after the page was loaded — nothing written for those fields. */
  outdated: number;
  failed: number;
}

/**
 * «Принять» of one text: for every language, `texts[l]` becomes its translation in every field holding
 * the text. `edited` languages are saved as the admin's own (MANUAL); the rest — the existing
 * translation is confirmed as checked (an outdated one is re-bound to the current original).
 */
export async function acceptText(
  s: UniqueString,
  texts: Partial<Record<TrLocale, string>>,
  edited: Partial<Record<TrLocale, boolean>>
): Promise<AcceptOutcome> {
  const out: AcceptOutcome = { done: 0, outdated: 0, failed: 0 };
  // Freshly written AI rows that the admin kept as is: marked checked right after the write.
  const followUp: TrAcceptItem[] = [];
  const plain: TrAcceptItem[] = [];
  for (const l of Object.keys(texts) as TrLocale[]) {
    const plan = planAccept(s, l, texts[l]!);
    plain.push(...plan.accept);
    if (!plan.write.length) continue;
    const own = !!edited[l];
    const r = await adminApi.translationsImport({ locale: l, origin: own ? "MANUAL" : "AI", force: true, items: plan.write });
    out.done += r.applied;
    out.outdated += r.skippedStale;
    out.failed += r.notFound + r.invalid + r.skippedManual;
    if (!own && r.applied) {
      const rejected = new Set(r.rejected.map((x) => `${x.entityType}:${x.entityId}:${x.field}`));
      for (const w of plan.write) {
        if (!rejected.has(`${w.entityType}:${w.entityId}:${w.field}`)) {
          followUp.push({ entityType: w.entityType, entityId: w.entityId, field: w.field, sourceHash: w.sourceHash, locale: l });
        }
      }
    }
  }
  if (plain.length || followUp.length) {
    const r = await adminApi.translationsAccept([...plain, ...followUp]);
    // The follow-ups were already counted as written.
    out.done += Math.max(0, r.accepted - followUp.length);
    out.outdated += r.skippedStale;
    out.failed += r.notFound + r.invalid;
  }
  return out;
}

const CHUNK = 5000;

/** Bulk «Принять все»: marks the current translations of these texts and languages as checked. */
export async function acceptAll(strings: UniqueString[], langs: TrLocale[]): Promise<AcceptOutcome> {
  const items: TrAcceptItem[] = [];
  for (const s of strings) {
    for (const f of s.fields) {
      for (const l of langs) {
        if (f.status[l] === "TRANSLATED" && !f.reviewed[l]) {
          items.push({ entityType: f.entityType, entityId: f.entityId, field: f.field, sourceHash: f.sourceHash, locale: l });
        }
      }
    }
  }
  const out: AcceptOutcome = { done: 0, outdated: 0, failed: 0 };
  for (let i = 0; i < items.length; i += CHUNK) {
    const r = await adminApi.translationsAccept(items.slice(i, i + CHUNK));
    out.done += r.accepted;
    out.outdated += r.skippedStale;
    out.failed += r.notFound + r.invalid;
  }
  return out;
}

/** «Удалить перевод» of one language: every field holding the text shows the Russian original again. */
export async function resetText(s: UniqueString, l: TrLocale): Promise<number> {
  let n = 0;
  for (const f of s.fields) {
    if (f.text[l] == null) continue;
    const r = await adminApi.translationsReset(l, f.entityType, f.entityId, f.field);
    n += r.deleted;
  }
  return n;
}
