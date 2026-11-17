import { formatPriceWithCents } from "@/lib/money";

/**
 * How a chart prints its numbers. A name, not a function: the charts are Client Components and a function cannot
 * cross from the Server Component that fetched the data.
 */
export const VALUE_FORMATS = { MONEY: "money", COUNT: "count" } as const;
export type ValueFormat = (typeof VALUE_FORMATS)[keyof typeof VALUE_FORMATS];

export function formatValue(value: number, format: ValueFormat): string {
  return format === VALUE_FORMATS.MONEY ? formatPriceWithCents(value) : `${value}`;
}

/** Axis ticks are short: "$ 100k" would not fit under every column. */
export function formatTick(value: number, format: ValueFormat): string {
  if (format === VALUE_FORMATS.COUNT) return `${value}`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} M`;
  return value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`;
}

/** A share the API sent as 0–1: "60%". Null (nothing to share) is a dash, never "0%". */
export function formatShare(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

/** A count the API sent: "23". Null (nothing to count against) is a dash. */
export function formatCount(value: number | null): string {
  return value === null ? "—" : `${value}`;
}
