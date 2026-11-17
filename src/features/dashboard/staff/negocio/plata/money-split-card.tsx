"use client";

import { useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@/components/ui/table";
import type { StatsMetaDto } from "@/lib/api/types";
import { formatPriceWithCents } from "@/lib/money";
import { cn } from "@/lib/cn";

import type { CompareParam } from "../../dashboard-params";

import { ChartDataTable } from "../charts/chart-data-table";
import { LazyDonutChart } from "../charts/lazy-charts";
import { formatShare, VALUE_FORMATS } from "../charts/value-format";
import { COMPARE_LABELS, formatChange } from "../format-change";
import { NegocioCard } from "../negocio-card";

export interface SplitRow {
  name: string;
  amount: number;
  previousAmount: number | null;
  /** 0–1 of what was collected, and the percent change against `previousAmount`: both as the API sent them. */
  share: number | null;
  change: number | null;
  /** A CSS token. */
  color: string;
}

export interface MoneySplitCardProps {
  byService: SplitRow[];
  byMethod: SplitRow[];
  /** Only a comparison with data gives the "vs" column and the compared amounts. */
  comparison: StatsMetaDto["comparison"];
  compare: CompareParam;
}

const SPLITS = { SERVICE: "service", METHOD: "method" } as const;
type Split = (typeof SPLITS)[keyof typeof SPLITS];

const SPLIT_OPTIONS = [
  { value: SPLITS.SERVICE, label: "Servicio" },
  { value: SPLITS.METHOD, label: "Medio de pago" },
];

const SPLIT_TEXT: Record<Split, { column: string; table: string }> = {
  [SPLITS.SERVICE]: { column: "Servicio", table: "Cobrado por servicio" },
  [SPLITS.METHOD]: { column: "Medio", table: "Cobrado por medio de pago" },
};

const CHANGE_TONE_CLASS = { up: "text-success", down: "text-danger", neutral: "text-muted" } as const;

function RowChange({ row, comparison, compare }: { row: SplitRow } & Pick<MoneySplitCardProps, "comparison" | "compare">) {
  const metric = { current: row.amount, previous: row.previousAmount, change: row.change, changeUnit: "percent" } as const;
  const { figure, tone } = formatChange(metric, comparison, false, compare);
  return <span className={cn("text-xs", CHANGE_TONE_CLASS[tone])}>{figure}</span>;
}

/** "De dónde viene": a donut and its table, by service or by payment method. The toggle is local state, not the URL. */
export function MoneySplitCard({ byService, byMethod, comparison, compare }: MoneySplitCardProps) {
  const [split, setSplit] = useState<Split>(SPLITS.SERVICE);
  const rows = split === SPLITS.SERVICE ? byService : byMethod;
  const text = SPLIT_TEXT[split];
  const comparing = comparison?.hasData === true;
  const previousName = comparing ? COMPARE_LABELS[compare] : null;

  const summary = rows.some((row) => row.amount > 0)
    ? rows.map((row) => `${row.name} ${formatShare(row.share)}`).join(", ")
    : "sin cobros en el período";

  return (
    <NegocioCard
      title="De dónde viene"
      action={
        <SegmentedControl
          aria-label="Ver por"
          options={SPLIT_OPTIONS}
          value={split}
          onChange={setSplit}
          className="[&>button]:px-2.5 [&>button]:py-1.5 [&>button]:text-[10px] [&>button]:font-semibold [&>button]:uppercase [&>button]:tracking-[0.1em]"
        />
      }
    >
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <LazyDonutChart
          label={`${text.table}: ${summary}`}
          valueFormat={VALUE_FORMATS.MONEY}
          parts={rows.map((row) => ({ name: row.name, value: row.amount, share: row.share, color: row.color }))}
        />
        <Table aria-label={text.table} className="w-full">
          <TableHeader>
            <TableHeaderCell className="px-0 py-2 tracking-[0.14em]">{text.column}</TableHeaderCell>
            <TableHeaderCell align="right" className="py-2 pr-0 tracking-[0.14em]">
              Cobrado
            </TableHeaderCell>
            {comparing ? (
              <TableHeaderCell align="right" className="py-2 pr-0 tracking-[0.14em]">
                vs
              </TableHeaderCell>
            ) : null}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="px-0 py-2.5 whitespace-nowrap">
                  <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full align-[1px]" style={{ background: row.color }} />
                  {row.name}
                </TableCell>
                <TableCell align="right" className="py-2.5 pr-0 whitespace-nowrap tabular-nums">
                  {formatPriceWithCents(row.amount)}
                  <br />
                  <span className="text-[11px] text-muted">{formatShare(row.share)}</span>
                </TableCell>
                {comparing ? (
                  <TableCell align="right" className="py-2.5 pr-0 whitespace-nowrap tabular-nums">
                    <RowChange row={row} comparison={comparison} compare={compare} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ChartDataTable
        caption={`Datos del gráfico: ${text.table.toLowerCase()}`}
        columns={[text.column, "Cobrado", ...(previousName ? [`Cobrado en el ${previousName}`] : [])]}
        rows={rows.map((row) => [
          row.name,
          formatPriceWithCents(row.amount),
          ...(previousName ? [row.previousAmount === null ? "—" : formatPriceWithCents(row.previousAmount)] : []),
        ])}
      />
    </NegocioCard>
  );
}
