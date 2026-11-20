import type { MetricValueDto, StatsMetaDto } from "@/lib/api/types";

import { CLIENTS_RANGE_PARAMS, type ClientsRangeParam } from "../../dashboard-params";

export interface RangeDelta {
  /** The part that takes the color: "▲ 9". */
  figure: string;
  /** The part that stays gray: "vs hace 6 meses". */
  context: string;
  /** The color: more clients is good news (`up`), fewer is bad news (`down`). */
  tone: "up" | "down" | "neutral";
}

const CONTEXTS: Record<ClientsRangeParam, string> = {
  [CLIENTS_RANGE_PARAMS.LAST_30_DAYS]: "vs hace 30 días",
  [CLIENTS_RANGE_PARAMS.LAST_3_MONTHS]: "vs hace 3 meses",
  [CLIENTS_RANGE_PARAMS.LAST_6_MONTHS]: "vs hace 6 meses",
  [CLIENTS_RANGE_PARAMS.ALL]: "vs el inicio del historial",
};

/**
 * How many more or fewer active clients there are today than the day before the range starts: a plain difference
 * ("▲ 9"), not a percentage. Without data to compare there is nothing to say, never "NaN".
 */
export function formatRangeDelta(
  metric: MetricValueDto,
  comparison: StatsMetaDto["comparison"],
  range: ClientsRangeParam,
): RangeDelta | null {
  if (comparison?.hasData !== true || metric.current === null || metric.previous === null) return null;

  const difference = metric.current - metric.previous;
  const context = CONTEXTS[range];
  if (difference === 0) return { figure: "= 0", context, tone: "neutral" };
  return difference > 0
    ? { figure: `▲ ${difference}`, context, tone: "up" }
    : { figure: `▼ ${Math.abs(difference)}`, context, tone: "down" };
}
