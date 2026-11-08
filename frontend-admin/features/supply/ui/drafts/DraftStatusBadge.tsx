import { Badge } from "@/components/ui/Badge";
import type { DraftStatus } from "../../api-drafts";

const LABEL: Record<DraftStatus, string> = { RUNNING: "ИИ работает", READY: "Готово — проверьте", FAILED: "Не вышло", ACCEPTED: "Поставка создана" };
const TONE = { RUNNING: "info", READY: "accent", FAILED: "danger", ACCEPTED: "ok" } as const;

export function DraftStatusBadge({ status }: { status: DraftStatus }) {
  return (
    <Badge tone={TONE[status]} dot>
      {LABEL[status]}
    </Badge>
  );
}
