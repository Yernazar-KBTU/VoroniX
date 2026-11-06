import { describe, expect, it } from "vitest";
import { safeEqual } from "../../src/lib/safe-equal.js";

describe("safeEqual", () => {
  it("accepts the same secret", () => expect(safeEqual("abc", "abc")).toBe(true));
  it("rejects a different secret", () => expect(safeEqual("abc", "abd")).toBe(false));
  it("rejects a different length", () => expect(safeEqual("abc", "abcd")).toBe(false));
  it("rejects a missing value", () => expect(safeEqual(undefined, "abc")).toBe(false));
});