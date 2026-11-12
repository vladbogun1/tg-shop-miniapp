import { describe, expect, it } from "vitest";
import { classifyTap, type LayerInfo } from "./blocked-tap";
import { capMeta, createTelemetryClient, toBatches, type TelemetryEvent } from "./client";
import { createDeadTapDetector, type Tap } from "./dead-taps";
import { stallOf, type Tick } from "./freeze";
import { createLimiter } from "./limiter";
import { fileBasename, sanitizePath, scrubText, shortUa, stackHead } from "./sanitize";

const plain: LayerInfo = {
  position: "static",
  opacity: 1,
  visibility: "visible",
  coverage: 0,
  ariaHidden: false,
  inert: false,
  backdropLike: false,
};
const layer = (over: Partial<LayerInfo>): LayerInfo => ({ ...plain, ...over });
const fixedFull = (over: Partial<LayerInfo> = {}): LayerInfo => layer({ position: "fixed", coverage: 1, ...over });

describe("classifyTap — тап в невидимый слой", () => {
  it("обычная кнопка без fixed-слоя — не блокировка", () => {
    expect(classifyTap({ chain: [plain, plain], visibleDialogs: 0 })).toBeNull();
  });

  it("fixed-слой меньше 80 % экрана (таб-бар) — не блокировка, даже прозрачный", () => {
    expect(classifyTap({ chain: [plain, fixedFull({ coverage: 0.1, opacity: 0 })], visibleDialogs: 0 })).toBeNull();
  });

  it("прозрачный полноэкранный слой (opacity 0 у предка) — transparent", () => {
    const r = classifyTap({ chain: [layer({ backdropLike: true }), fixedFull({ opacity: 0.01 })], visibleDialogs: 1 });
    expect(r).toEqual({ reason: "transparent", layerIndex: 1 });
  });

  it("непрозрачность перемножается по цепочке", () => {
    const r = classifyTap({ chain: [layer({ opacity: 0.2 }), fixedFull({ opacity: 0.2 })], visibleDialogs: 1 });
    expect(r?.reason).toBe("transparent");
  });

  it("visibility hidden, aria-hidden и inert", () => {
    expect(classifyTap({ chain: [layer({ visibility: "hidden" }), fixedFull({ visibility: "hidden" })], visibleDialogs: 0 })?.reason).toBe("hidden");
    expect(classifyTap({ chain: [plain, fixedFull({ ariaHidden: true })], visibleDialogs: 1 })?.reason).toBe("aria_hidden");
    expect(classifyTap({ chain: [plain, fixedFull(), layer({ inert: true })], visibleDialogs: 1 })?.reason).toBe("inert");
  });

  it("затемнение без открытого окна — empty_backdrop; с видимым окном — нормальный тап «мимо окна»", () => {
    const chain = [layer({ backdropLike: true }), fixedFull()];
    expect(classifyTap({ chain, visibleDialogs: 0 })).toEqual({ reason: "empty_backdrop", layerIndex: 1 });
    expect(classifyTap({ chain, visibleDialogs: 1 })).toBeNull();
  });

  it("видимое полноэкранное окно с кнопкой — не блокировка", () => {
    expect(classifyTap({ chain: [plain, fixedFull()], visibleDialogs: 1 })).toBeNull();
  });
});

describe("stallOf — зависание только на видимой странице", () => {
  const t = (at: number, visible = true, epoch = 0): Tick => ({ at, visible, epoch });

  it("тик опоздал на 2.5 с при видимой странице — зависание", () => {
    expect(stallOf(t(1000), t(4500))).toBe(2500);
  });

  it("опоздание меньше 2 с — не зависание", () => {
    expect(stallOf(t(1000), t(3900))).toBeNull();
  });

  it("предыдущий или текущий тик в фоне — не зависание (iOS усыпляет страницу)", () => {
    expect(stallOf(t(1000, false), t(60_000))).toBeNull();
    expect(stallOf(t(1000), t(60_000, false))).toBeNull();
  });

  it("между тиками менялась видимость (свернули и вернули) — не зависание", () => {
    expect(stallOf(t(1000, true, 0), t(60_000, true, 2))).toBeNull();
  });

  it("первый тик — сравнивать не с чем", () => {
    expect(stallOf(null, t(5000))).toBeNull();
  });
});

describe("createLimiter — склейка и лимит в минуту", () => {
  it("одно и то же событие не чаще раза в 60 с", () => {
    const l = createLimiter();
    expect(l.allow("error|boom|/orders", 0)).toBe(true);
    expect(l.allow("error|boom|/orders", 59_000)).toBe(false);
    expect(l.allow("error|boom|/products", 59_000)).toBe(true);
    expect(l.allow("error|boom|/orders", 60_000)).toBe(true);
  });

  it("не больше 30 разных событий в минуту", () => {
    const l = createLimiter({ perMinute: 30 });
    const allowed = Array.from({ length: 40 }, (_, i) => l.allow(`k${i}`, i * 100)).filter(Boolean).length;
    expect(allowed).toBe(30);
    expect(l.allow("later", 61_000)).toBe(true);
  });
});

describe("sanitize — без id и персональных данных", () => {
  it("uuid в пути → <id>, из query остаётся только tab", () => {
    expect(sanitizePath("/orders/3f2a1b4c-1111-2222-3333-444455556666", "?tab=chat&q=Иван&phone=380")).toBe("/orders/<id>?tab=chat");
    expect(sanitizePath("/supply/12345/edit", "")).toBe("/supply/<id>/edit");
    expect(sanitizePath("/orders", "?q=test")).toBe("/orders");
  });

  it("в тексте ошибки нет почты, телефонов, uuid и адреса сайта", () => {
    const s = scrubText("Fail https://admin.example.com/api/x for ivan@mail.com +380 67 123 45 67 id 3f2a1b4c-1111-2222-3333-444455556666");
    expect(s).not.toContain("ivan@mail.com");
    expect(s).not.toContain("123 45 67");
    expect(s).not.toContain("3f2a1b4c");
    expect(s).not.toContain("example.com");
    expect(s).toContain("<email>");
  });

  it("имя файла, первые строки стека, короткий UA", () => {
    expect(fileBasename("https://x/_next/static/chunks/app-123.js?v=1")).toBe("app-123.js");
    expect(stackHead("a\nb\nc\nd\ne\nf\ng")).toHaveLength(5);
    expect(
      shortUa("Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1")
    ).toBe("iPhone; CPU iPhone OS 27_0 like Mac OS X AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1");
  });
});

describe("createDeadTapDetector — злые тапы", () => {
  const tap = (at: number, over: Partial<Tap> = {}): Tap => ({ x: 100, y: 200, at, nav: 0, net: 0, ...over });

  it("4 тапа за 2 с в одной точке — одна серия, продолжение серии не повторяется", () => {
    const d = createDeadTapDetector();
    expect(d.push(tap(0))).toBeNull();
    expect(d.push(tap(300))).toBeNull();
    expect(d.push(tap(600))).toBeNull();
    expect(d.push(tap(900))?.length).toBe(4);
    for (let i = 1; i <= 6; i += 1) expect(d.push(tap(900 + i * 300))).toBeNull();
    // пауза больше 2 с — новая серия может начаться
    [5000, 5200, 5400].forEach((at) => expect(d.push(tap(at))).toBeNull());
    expect(d.push(tap(5600))).not.toBeNull();
  });

  it("был запрос или переход между тапами — не серия", () => {
    const d = createDeadTapDetector();
    d.push(tap(0));
    d.push(tap(300));
    d.push(tap(600, { net: 1 }));
    expect(d.push(tap(900, { net: 1 }))).toBeNull();
    const n = createDeadTapDetector();
    n.push(tap(0));
    n.push(tap(300, { nav: 1 }));
    n.push(tap(600, { nav: 1 }));
    expect(n.push(tap(900, { nav: 1 }))).toBeNull();
  });

  it("тапы далеко друг от друга или растянуты дольше 2 с — не серия", () => {
    const d = createDeadTapDetector();
    [0, 300, 600].forEach((at, i) => d.push(tap(at, { x: 100 + i * 50 })));
    expect(d.push(tap(900, { x: 250 }))).toBeNull();
    const s = createDeadTapDetector();
    [0, 800, 1600].forEach((at) => s.push(tap(at)));
    expect(s.push(tap(2400))).toBeNull();
  });
});

describe("client — очередь, лимиты, пачки", () => {
  const ctx = { path: "/orders", build: "b1", ua: "iPhone", standalone: true };

  function setup(canSend = true) {
    let clock = 0;
    const sent: TelemetryEvent[][] = [];
    const c = createTelemetryClient({
      now: () => clock,
      context: () => ctx,
      send: (events) => {
        if (!canSend) return false;
        sent.push(events);
        return true;
      },
    });
    return { c, sent, tick: (ms: number) => (clock += ms) };
  }

  it("крошки прикладываются к ошибке, но не к api_401; одинаковая ошибка склеивается", () => {
    const { c, sent, tick } = setup();
    c.crumb("route", "/orders");
    tick(1000);
    c.report("error", { message: "boom" }, "boom");
    c.report("error", { message: "boom" }, "boom");
    c.report("api_401", { status: 401, endpoint: "/api/admin/orders" });
    c.report("api_401", { status: 403, endpoint: "/api/admin/x" });
    c.flush();
    expect(sent).toHaveLength(1);
    const [err, auth] = sent[0] ?? [];
    expect(sent[0]).toHaveLength(2);
    expect(err?.meta.trail).toEqual(["-1s route /orders"]);
    expect(auth?.kind).toBe("api_401");
    expect(auth?.meta.trail).toBeUndefined();
  });

  it("без токена события остаются в очереди и отдаются drain()", () => {
    const { c, sent } = setup(false);
    c.report("freeze", { stallMs: 3000 });
    c.flush();
    expect(sent).toHaveLength(0);
    expect(c.drain()).toHaveLength(1);
    expect(c.drain()).toHaveLength(0);
  });

  it("meta режется: сначала крошки, потом всё, кроме сообщения", () => {
    const withTrail = capMeta({ message: "m", trail: Array.from({ length: 50 }, () => "x".repeat(60)) });
    expect(withTrail.trail).toBeUndefined();
    expect(withTrail.trailDropped).toBe(true);
    const huge = capMeta({ message: "y".repeat(5000) });
    expect(huge.truncated).toBe(true);
    expect(String(huge.message)).toHaveLength(200);
  });

  it("пачки не больше 50 событий и 48 КБ", () => {
    const ev = (n: number): TelemetryEvent => ({ kind: "error", ...ctx, meta: { message: "z".repeat(n) } });
    expect(toBatches(Array.from({ length: 120 }, () => ev(10))).map((b) => b.length)).toEqual([50, 50, 20]);
    const big = toBatches(Array.from({ length: 40 }, () => ev(1700)));
    expect(big.length).toBeGreaterThan(1);
    big.forEach((b) => expect(JSON.stringify(b).length).toBeLessThanOrEqual(48_000));
  });
});
