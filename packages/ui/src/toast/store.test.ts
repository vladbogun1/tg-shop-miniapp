import { beforeEach, describe, expect, it } from "vitest";
import { clearToasts, dismissOtherToasts, getToasts, toast } from "./store";

describe("toast store", () => {
  beforeEach(clearToasts);

  it("добавляет по видам и убирает по id", () => {
    const a = toast.success("ok");
    toast.error("bad", { duration: 10 });
    expect(getToasts().map((t) => t.kind)).toEqual(["success", "error"]);
    toast.dismiss(a);
    expect(getToasts()).toHaveLength(1);
  });

  it("dismissOtherToasts оставляет один", () => {
    toast.info("a");
    const b = toast.info("b");
    dismissOtherToasts(b);
    expect(getToasts().map((t) => t.id)).toEqual([b]);
  });
});
