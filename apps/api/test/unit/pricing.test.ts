import { describe, expect, it } from "vitest";
import { money, prepaymentFor } from "../../src/domain/pricing.js";

const biz = { prepay_percent: 30, prepay_min_price: 20000 };

describe("prepaymentFor (business rule from the Task 9 report)", () => {
  it("asks 30% for services from 20 000 ₸", () => {
    expect(prepaymentFor({ price_kzt: 25000 }, biz)).toBe(7500);
    expect(prepaymentFor({ price_kzt: 20000 }, biz)).toBe(6000);
  });
  it("asks nothing below the threshold", () => {
    expect(prepaymentFor({ price_kzt: 19999 }, biz)).toBe(0);
    expect(prepaymentFor({ price_kzt: 8000 }, biz)).toBe(0);
  });
  it("asks nothing when prepayment is switched off", () => {
    expect(prepaymentFor({ price_kzt: 50000 }, { prepay_percent: 0, prepay_min_price: 0 })).toBe(0);
  });
  it("rounds to whole tenge", () => {
    expect(prepaymentFor({ price_kzt: 33333 }, biz)).toBe(10000);
  });
});

describe("money", () => {
  it("formats tenge with thin grouping", () => {
    expect(money(25000)).toBe("25 000 ₸");
    expect(money(1029000)).toBe("1 029 000 ₸");
  });
});
