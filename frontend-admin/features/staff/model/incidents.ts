import type { Incident } from "../api";

export type IncidentSeverity = "HIGH" | "MEDIUM" | "LOW";
export type IncidentStatus = "OPEN" | "RESOLVED";

export const SEVERITY: Record<IncidentSeverity, { label: string; tone: "danger" | "warn" | "neutral" }> = {
  HIGH: { label: "Важно", tone: "danger" },
  MEDIUM: { label: "Средне", tone: "warn" },
  LOW: { label: "Мелочь", tone: "neutral" },
};

const RANK: Record<IncidentSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function severityOf(i: Incident): IncidentSeverity {
  return i.severity in SEVERITY ? (i.severity as IncidentSeverity) : "MEDIUM";
}

/** A deleted order the detector found and nobody has written up yet (it still has the detector's title). */
function isRoutine(i: Incident): boolean {
  return i.title.startsWith("Заказ удалён безвозвратно");
}

export function openCount(all: Incident[]): number {
  return all.filter((i) => i.status === "OPEN").length;
}

/** Important first; within a level, cards with a written-up hypothesis before the detector's routine ones. */
export function incidentsOf(all: Incident[], status: IncidentStatus): Incident[] {
  return all
    .filter((i) => i.status === status)
    .sort((a, b) => RANK[severityOf(a)] - RANK[severityOf(b)] || Number(isRoutine(a)) - Number(isRoutine(b)));
}
