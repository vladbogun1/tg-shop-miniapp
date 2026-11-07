import { describe, expect, it } from "vitest";
import type { AiBatchRow } from "../api-batch";
import { batchReport } from "./batch-report";

const row = (id: number, subjectId: string, o: Partial<AiBatchRow> = {}): AiBatchRow =>
  ({ id, subjectId, status: "DONE", searched: true, applied: 0, rejected: 0, ignored: 0, ...o }) as AiBatchRow;

describe("итог пакета по карточкам", () => {
  it("раскладывает по последней задаче товара: записано, отклонено, ждут, без результата", () => {
    const r = batchReport([
      row(1, "a", { outcome: "APPLIED" }),
      row(2, "b", { outcome: "PARTIAL" }),
      row(3, "c", { outcome: "REJECTED" }),
      row(4, "d"),
      row(5, "e", { status: "FAILED", errorCode: "RESTARTED" }),
      // повтор неудачной: считается только он
      row(6, "f", { status: "FAILED" }),
      row(7, "f", { outcome: "APPLIED" }),
      row(8, "g", { status: "RUNNING" }),
    ]);
    expect(r.written.map((x) => x.subjectId)).toEqual(["a", "b", "f"]);
    expect(r.rejected.map((x) => x.subjectId)).toEqual(["c"]);
    expect(r.waiting.map((x) => x.subjectId)).toEqual(["d"]);
    expect(r.failed.map((x) => x.subjectId)).toEqual(["e"]);
    expect(r.failed[0].why).toContain("перезапуском");
    expect(r.running).toBe(1);
  });

  it("ничего нет — пустые списки", () => {
    const r = batchReport([]);
    expect(r.written).toEqual([]);
    expect(r.running).toBe(0);
  });
});
