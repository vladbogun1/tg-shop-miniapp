import { describe, expect, it } from "vitest";
import { admitFiles, admitMessages, MAX_FILE_BYTES, percent, picturesCounter } from "./files-limit";

const f = (name: string, size = 1000) => ({ name, size });

describe("limit of 10 pictures per task", () => {
  it("takes what fits and names the rest", () => {
    const a = admitFiles([f("a.jpg"), f("b.jpg"), f("c.jpg")], 8);
    expect(a.take.map((x) => x.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(a.overLimit.map((x) => x.name)).toEqual(["c.jpg"]);
    expect(admitMessages(a, 8)).toEqual(["За раз читается не больше 10 картинок, место ещё для 2. Не добавлены: c.jpg"]);
  });

  it("a full set takes nothing and says so", () => {
    const a = admitFiles([f("a.jpg")], 10);
    expect(a.take).toEqual([]);
    expect(admitMessages(a, 10)[0]).toBe("Уже 10 из 10 картинок — больше за раз не читается. Не добавлены: a.jpg");
  });

  it("a file over 10 MB is refused before the limit is counted", () => {
    const a = admitFiles([f("big.pdf", MAX_FILE_BYTES + 1), f("ok.png")], 9);
    expect(a.take.map((x) => x.name)).toEqual(["ok.png"]);
    expect(admitMessages(a, 9)).toEqual(["Больше 10 МБ, не загружаю: big.pdf"]);
  });

  it("long lists are shortened, a pasted picture without a name is named", () => {
    const a = admitFiles([f(""), f("b"), f("c"), f("d"), f("e")], 10);
    expect(admitMessages(a, 10)[0]).toContain("Не добавлены: картинка, b, c и ещё 2");
    expect(admitMessages(admitFiles([f("a")], 0), 0)).toEqual([]);
  });

  it("counter and percent", () => {
    expect(picturesCounter(3, 2)).toBe("5 из 10 картинок");
    expect(percent(0.456)).toBe("46 %");
    expect(percent(1.2)).toBe("100 %");
  });
});
