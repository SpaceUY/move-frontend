import { SERVICE_LABELS } from "@/features/payments/staff";
import type { MoneyStatsDto, ServiceType } from "@/lib/api/types";
import { formatPriceWithCents } from "@/lib/money";

import { COMPARE_PARAMS, SERVICE_PARAMS, type DashboardParams } from "../../dashboard-params";
import { ChartDataTable } from "../charts/chart-data-table";
import { LazyStackedColumnsChart } from "../charts/lazy-charts";
import type { StackedBucket } from "../charts/stacked-columns-chart";
import { VALUE_FORMATS } from "../charts/value-format";
import { COMPARE_LABELS, formatChange } from "../format-change";
import { bucketLabel, bucketRange, formatShortDate, seriesSpansYears } from "../format-date";
import { ACTIVE_CLIENT_INFO } from "../info-texts";
import { KpiTile } from "../kpi-tile";
import { NegocioCard } from "../negocio-card";
import { loadStats } from "../load-stats";
import { NegocioInvalidRange, NegocioSectionError, NegocioUnsupportedCurrency } from "../negocio-section-error";
import { PeriodNote } from "../period-note";
import { SERVICE_COLORS, shownServices } from "../services";
import { GRANULARITY_LABELS, GranularityLinks } from "./granularity-links";
import { getMoneyStats } from "./get-money-stats";
import { MoneySplitCard, type SplitRow } from "./money-split-card";

const METHODS: Record<MoneyStatsDto["byMethod"][number]["method"], { name: string; color: string }> = {
  mercado_pago: { name: "Mercado Pago", color: "var(--color-chart-1)" },
  cash: { name: "Efectivo", color: "var(--color-chart-2)" },
  transfer: { name: "Transferencia", color: "var(--color-chart-3)" },
};

const GRANULARITY_NOUNS = { day: "día", week: "semana", month: "mes" } as const;

const INFO = {
  collected:
    "Mercado Pago aprobado + pagos en mano registrados en el período, por fecha de cobro. Las devoluciones (reintegros y contracargos de Mercado Pago) no se descuentan acá: se muestran aparte, en el período en que ocurrieron. No incluyen devoluciones parciales ni las de efectivo hechas por fuera del sistema.",
  perDay: "Cobrado ÷ días del período. Sirve para comparar períodos de distinto largo.",
  perActiveClient:
    `Cobrado por mes ÷ clientes activos. ${ACTIVE_CLIENT_INFO}`,
} as const;

const money = (metric: { current: number | null }) => (metric.current === null ? "—" : formatPriceWithCents(metric.current));

// The API's `byService` does not take the service filter, so the split keeps only the service in the URL: the donut
// then agrees with "Cobrado", which the API did filter.
function serviceRows(stats: MoneyStatsDto, services: ServiceType[]): SplitRow[] {
  return stats.byService
    .filter((row) => services.includes(row.service))
    .map((row) => ({
      name: SERVICE_LABELS[row.service],
      amount: row.amount,
      previousAmount: row.previousAmount,
      share: row.share,
      change: row.change,
      color: SERVICE_COLORS[row.service],
    }));
}

function methodRows(stats: MoneyStatsDto): SplitRow[] {
  return stats.byMethod.map((row) => ({
    name: METHODS[row.method].name,
    amount: row.amount,
    previousAmount: row.previousAmount,
    share: row.share,
    change: row.change,
    color: METHODS[row.method].color,
  }));
}

export async function PlataSection({ params }: { params: DashboardParams }) {
  const load = await loadStats(() => getMoneyStats(params));
  if ("failure" in load) {
    if (load.failure === "invalid-range") return <NegocioInvalidRange params={params} />;
    if (load.failure === "unsupported-currency") return <NegocioUnsupportedCurrency />;
    return <NegocioSectionError title="No pudimos cargar la plata" params={params} />;
  }
  const { stats } = load;

  const { meta } = stats;
  const hasComparison = meta.comparison?.hasData === true;
  const previousName = hasComparison && params.compare !== COMPARE_PARAMS.NONE ? COMPARE_LABELS[params.compare] : null;
  const services = shownServices(params);
  const noun = GRANULARITY_NOUNS[meta.granularity];
  const spansYears = seriesSpansYears(stats.series);
  const refunds = stats.refunds.current ?? 0;

  const buckets: StackedBucket[] = stats.series.map((point) => ({
    label: bucketLabel(point.from, meta.granularity, spansYears),
    range: bucketRange(point, spansYears),
    inProgress: point.inProgress,
    values: point.byService,
    total: point.total,
    previous: hasComparison ? point.previousTotal : null,
  }));
  const kpi = { comparison: meta.comparison, compare: params.compare };
  // The conclusion, from numbers the API sent: "—" (no change to give) is left out.
  const change = formatChange(stats.collected, meta.comparison, false, params.compare).text;
  const conclusion = [`${money(stats.collected)} en total`, change === "—" ? "" : change].filter(Boolean).join(", ");
  const columnsLabel = `Cobrado por ${noun} del ${formatShortDate(meta.period.from, true)} al ${formatShortDate(meta.period.to, true)}: ${conclusion}. Los datos exactos están en Ver datos.`;
  const serviceSuffix = params.service === SERVICE_PARAMS.ALL ? "" : ` · ${SERVICE_LABELS[params.service]}`;

  return (
    <div className="grid gap-4">
      <PeriodNote meta={meta} source="plata" />
      <h2 className="m-0 font-display text-lg font-extrabold lg:text-[22px]">{`¿Cuánto entra y de dónde?${serviceSuffix}`}</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <KpiTile
          label="Cobrado"
          info={INFO.collected}
          value={money(stats.collected)}
          metric={stats.collected}
          note={refunds > 0 ? `Devoluciones −${formatPriceWithCents(refunds)}` : undefined}
          {...kpi}
        />
        <KpiTile label="Promedio por día" info={INFO.perDay} value={money(stats.perDay)} metric={stats.perDay} {...kpi} />
        <KpiTile
          label="Por cliente activo"
          info={INFO.perActiveClient}
          value={money(stats.perActiveClient)}
          metric={stats.perActiveClient}
          note="por mes"
          {...kpi}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MoneySplitCard
          byService={serviceRows(stats, services)}
          byMethod={methodRows(stats)}
          comparison={meta.comparison}
          compare={params.compare}
        />
        <NegocioCard
          title={`Cobrado por ${noun}`}
          action={<GranularityLinks params={params} current={meta.granularity} options={meta.granularityOptions} />}
        >
          <LazyStackedColumnsChart
            label={columnsLabel}
            buckets={buckets}
            series={services.map((service) => ({ key: service, name: SERVICE_LABELS[service], color: SERVICE_COLORS[service] }))}
            previousName={previousName}
            valueFormat={VALUE_FORMATS.MONEY}
          />
          <ChartDataTable
            caption={`Cobrado por ${noun}`}
            columns={[
              GRANULARITY_LABELS[meta.granularity],
              ...services.map((service) => SERVICE_LABELS[service]),
              ...(previousName ? [`Total del ${previousName}`] : []),
            ]}
            rows={buckets.map((bucket) => [
              bucket.range,
              ...services.map((service) => formatPriceWithCents(bucket.values[service] ?? 0)),
              ...(previousName ? [bucket.previous === null ? "—" : formatPriceWithCents(bucket.previous)] : []),
            ])}
          />
        </NegocioCard>
      </div>
    </div>
  );
}
