import { describe, expect, it } from "vitest";

import type { MetricValueDto } from "@/lib/api/types";

import { formatRangeDelta } from "./range-delta";

const metric = (current: number | null, previous: number | null): MetricValueDto => ({
  current,
  previous,
  change: null,
  changeUnit: "percent",
});
const WITH_DATA = { from: "2026-02-20", to: "2026-05-19", inProgress: false, hasData: true };

describe("formatRangeDelta", () => {
  it("subtracts the previous count: 71 against 62 is ▲ 9 vs hace 6 meses", () => {
    expect(formatRangeDelta(metric(71, 62), WITH_DATA, "6-meses")).toEqual({
      figure: "▲ 9",
      context: "vs hace 6 meses",
      tone: "up",
    });
  });

  it("goes down: 71 against 74 is ▼ 3 with tone down", () => {
    expect(formatRangeDelta(metric(71, 74), WITH_DATA, "6-meses")).toMatchObject({ figure: "▼ 3", tone: "down" });
  });

  it("equal counts are = 0 with tone neutral", () => {
    expect(formatRangeDelta(metric(71, 71), WITH_DATA, "6-meses")).toMatchObject({ figure: "= 0", tone: "neutral" });
  });

  it("is null without comparison data, without previous or with a null current", () => {
    expect(formatRangeDelta(metric(71, 62), null, "6-meses")).toBeNull();
    expect(formatRangeDelta(metric(71, 62), { ...WITH_DATA, hasData: false }, "6-meses")).toBeNull();
    expect(formatRangeDelta(metric(71, null), WITH_DATA, "6-meses")).toBeNull();
    expect(formatRangeDelta(metric(null, 62), WITH_DATA, "6-meses")).toBeNull();
  });

  it("writes the context of each range", () => {
    const context = (range: Parameters<typeof formatRangeDelta>[2]) => formatRangeDelta(metric(2, 1), WITH_DATA, range)?.context;

    expect(context("30-dias")).toBe("vs hace 30 días");
    expect(context("3-meses")).toBe("vs hace 3 meses");
    expect(context("6-meses")).toBe("vs hace 6 meses");
    expect(context("todo")).toBe("vs el inicio del historial");
  });
});
