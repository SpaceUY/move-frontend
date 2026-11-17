import { describe, expect, it } from "vitest";

import { formatExactPrice, formatPrice, formatPriceWithCents } from "./money";

describe("formatPrice", () => {
  it("groups thousands with a dot", () => {
    expect(formatPrice(10500)).toBe("$ 10.500");
  });

  it("leaves short amounts ungrouped", () => {
    expect(formatPrice(900)).toBe("$ 900");
  });

  it("groups four-digit amounts too", () => {
    expect(formatPrice(3900)).toBe("$ 3.900");
  });

  it("rounds a fractional amount up to the next whole peso", () => {
    expect(formatPrice(1800.5)).toBe("$ 1.801");
  });

  it("does not move an amount that is already whole", () => {
    expect(formatPrice(10500)).toBe("$ 10.500");
  });
});

describe("formatExactPrice", () => {
  it("shows a whole amount without decimals", () => {
    expect(formatExactPrice(1800)).toBe("$ 1.800");
    expect(formatExactPrice(900)).toBe("$ 900");
  });

  it("shows the real cents with a comma instead of rounding up", () => {
    expect(formatExactPrice(1800.5)).toBe("$ 1.800,50");
    expect(formatExactPrice(1200.25)).toBe("$ 1.200,25");
  });
});

describe("formatPriceWithCents", () => {
  it("shows two decimals for a whole amount", () => {
    expect(formatPriceWithCents(372660)).toBe("$ 372.660,00");
    expect(formatPriceWithCents(900)).toBe("$ 900,00");
  });

  it("shows the real cents with a comma", () => {
    expect(formatPriceWithCents(12021.29)).toBe("$ 12.021,29");
  });
});
