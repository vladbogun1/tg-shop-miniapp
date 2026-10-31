import { describe, expect, it } from "vitest";
import { countryCount, locatedVisitors, placeName, pointKey } from "./geo";
import type { GeoPoint } from "./types";

const pt = (p: Partial<GeoPoint>): GeoPoint => ({
  lat: 1,
  lon: 2,
  city: "Kyiv",
  country: "Ukraine",
  countryCode: "UA",
  visitors: 1,
  users: 0,
  anonymous: 1,
  miniapp: 0,
  web: 1,
  lastSeen: "",
  ...p,
});

describe("карта пользователей", () => {
  it("ключ точки и название места", () => {
    expect(pointKey({ lat: 50.5, lon: 30.5 })).toBe("50.5,30.5");
    expect(placeName({ city: "Kyiv", country: "Ukraine" })).toBe("Kyiv, Ukraine");
    expect(placeName({ city: null, country: "Ukraine" })).toBe("Ukraine");
    expect(placeName({ city: null, country: null })).toBe("Неизвестно");
  });
  it("сумма посетителей и число стран без пустых кодов", () => {
    const points = [pt({ visitors: 3 }), pt({ visitors: 4, countryCode: "PL" }), pt({ visitors: 5, countryCode: "UA" }), pt({ countryCode: "" })];
    expect(locatedVisitors(points)).toBe(3 + 4 + 5 + 1);
    expect(countryCount(points)).toBe(2);
  });
});
