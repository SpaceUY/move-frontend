import type { StatsMetaDto, StatsWindowDto } from "@/lib/api/types";

import { formatShortDate as formatDate, yearOf } from "./format-date";

function formatRange({ from, to }: StatsWindowDto, withYear: boolean): string {
  return from === to ? formatDate(from, withYear) : `${formatDate(from, withYear)} – ${formatDate(to, withYear)}`;
}

// Each tab counts from the first record of its own source, so the date changes between tabs: the note says which
// record it is, so nobody takes the difference for a mistake.
const SOURCES = {
  plata: "Datos de plata desde {date} (el primer cobro registrado)",
  turnos: "Datos de turnos desde {date} (el primer turno)",
} as const;

export type PeriodNoteSource = keyof typeof SOURCES;

/**
 * "1 oct – 31 oct · comparado con 1 sep – 30 sep · Datos de plata desde 12 mar 2026 (el primer cobro registrado)": the windows the API resolved, so
 * the front never works out a date. The year appears only when the dates would be ambiguous without it.
 */
export function PeriodNote({ meta, source }: { meta: StatsMetaDto; source: PeriodNoteSource }) {
  const { period, comparison, dataSince } = meta;
  const years = new Set([period.from, period.to, ...(comparison ? [comparison.from, comparison.to] : [])].map(yearOf));
  const withYear = years.size > 1;

  const parts = [formatRange(period, withYear)];
  if (comparison) {
    parts.push(`comparado con ${comparison.hasData ? formatRange(comparison, withYear) : "— sin datos"}`);
  }
  if (dataSince) parts.push(SOURCES[source].replace("{date}", formatDate(dataSince, true)));

  return <p className="text-xs text-muted">{parts.join(" · ")}</p>;
}
