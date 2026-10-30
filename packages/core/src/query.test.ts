import { describe, expect, it } from "vitest";
import { QUERY_PRESETS, makeQueryClient } from "./query";

describe("makeQueryClient", () => {
  it("defaults to the list preset, one retry, no refetch on focus", () => {
    const o = makeQueryClient().getDefaultOptions().queries!;
    expect([o.staleTime, o.retry, o.refetchOnWindowFocus]).toEqual([QUERY_PRESETS.list.staleTime, 1, false]);
  });

  it("an app can pick its own default staleTime (the admin panel: 15 s)", () => {
    expect(makeQueryClient({ staleTime: 15_000 }).getDefaultOptions().queries!.staleTime).toBe(15_000);
  });

  it("presets: live polls, static is longer-lived than list", () => {
    expect(QUERY_PRESETS.live.refetchInterval).toBeGreaterThan(0);
    expect(QUERY_PRESETS.static.staleTime).toBeGreaterThan(QUERY_PRESETS.list.staleTime);
  });
});
