import type { ReactNode } from "react";

import { REASON_LABELS } from "@/features/followup";
import { SERVICE_LABELS } from "@/features/payments/staff";
import type { ClientsStatsDto } from "@/lib/api/types";

import { COMPARE_PARAMS, SERVICE_PARAMS, type DashboardParams } from "../../dashboard-params";
import { cn } from "@/lib/cn";
import { ServiceDot } from "../../service-dot";
import { BarList } from "../charts/bar-list";
import { ChartDataTable } from "../charts/chart-data-table";
import { LazyLineWithBarsChart } from "../charts/lazy-charts";
import { formatCount, formatShare } from "../charts/value-format";
import { bucketLabel, bucketRange, formatShortDate, seriesSpansYears, yearOf } from "../format-date";
import { ACTIVE_CLIENT_INFO } from "../info-texts";
import { KpiTile } from "../kpi-tile";
import { loadStats } from "../load-stats";
import { NegocioCard } from "../negocio-card";
import { NegocioInvalidRange, NegocioSectionError } from "../negocio-section-error";
import { GRANULARITY_LABELS } from "../plata/granularity-links";
import { SERVICE_COLORS } from "../services";
import { getClientsStats } from "./get-clients-stats";
import { formatRangeDelta } from "./range-delta";

const TONE_CLASS = { up: "text-success", down: "text-danger", neutral: "text-muted" } as const;

const GRANULARITY_NOUNS = { day: "día", week: "semana", month: "mes" } as const;

const INFO = {
  active:
    `${ACTIVE_CLIENT_INFO} Bajas: clientes cuyo plan venció en el período y ya pasaron los días de gracia sin renovar. En curso: los que todavía están dentro de esos días, así que el número puede subir. Dadas de baja por el staff: cuentas que el staff desactivó en el período; no se cuentan también como bajas.`,
  renewal:
    "De los planes de Performance o Recovery que vencieron en el período, cuántos planes se renovaron con otro del mismo servicio dentro de los días de gracia que están en Configuración. Los que todavía están dentro de esos días figuran como en curso. Rehab no tiene planes.",
  paused: "Clientes con una pausa abierta al final del período.",
} as const;

// Only these have plans, so only these can have a renewal. A string list: the guard is for what the API might send.
const SERVICES_WITH_PLANS: readonly string[] = ["performance", "recovery"];

// The back sends the six reasons of the follow-up; anything else is a reason this screen does not know yet.
function pauseReasonLabel(reason: string): string {
  return Object.hasOwn(REASON_LABELS, reason) ? REASON_LABELS[reason as keyof typeof REASON_LABELS] : "Otro motivo";
}

// "+9 altas" / "−4 bajas"; a count with nothing to count (null) is a dash with no sign: "— bajas".
const signedCount = (sign: "+" | "−", value: number | null): string => (value === null ? "—" : `${sign}${value}`);

/**
 * What goes under "Clientes activos": "+9 altas / −3 bajas", then the leaves still inside the grace days and the ones
 * the staff made, each only when there is something to say. The API sends the numbers; this only chooses the words.
 */
export function leavesNote({ joins, leaves, staffLeaves }: Pick<ClientsStatsDto, "joins" | "leaves" | "staffLeaves">): ReactNode {
  const staff = staffLeaves.current ?? 0;
  return (
    <>
      <span className="text-success">{`${signedCount("+", joins.current)} altas`}</span>
      {" / "}
      <span className="text-danger">{`${signedCount("−", leaves.current)} bajas`}</span>
      {leaves.pending !== null && leaves.pending > 0 ? ` · ${leaves.pending} en curso` : null}
      {staff > 0 ? ` · ${staff} ${staff === 1 ? "dada" : "dadas"} de baja por el staff` : null}
    </>
  );
}

/**
 * Clientes: do we grow or lose people, and why? Every number arrives from the API, and the front only formats it:
 * "Renovación por servicio" draws the `rate` of each service and writes "renewed de due" under it.
 */
export async function ClientesSection({ params }: { params: DashboardParams }) {
  const load = await loadStats(() => getClientsStats(params));
  if ("failure" in load) {
    return load.failure === "invalid-range" ? (
      <NegocioInvalidRange params={params} />
    ) : (
      <NegocioSectionError title="No pudimos cargar los clientes" params={params} />
    );
  }
  const { stats } = load;

  const { meta } = stats;
  const noun = GRANULARITY_NOUNS[meta.granularity];
  const spansYears = seriesSpansYears(stats.series);
  // The tiles carry no comparison of their own: the only delta is the one of today's active clients, in its note.
  const kpi = { comparison: null, compare: COMPARE_PARAMS.NONE };
  const delta = formatRangeDelta(stats.active, meta.comparison, params.clientsRange);
  const withYear = yearOf(meta.period.from) !== yearOf(meta.period.to);
  const serviceSuffix = params.service === SERVICE_PARAMS.ALL ? "" : ` · ${SERVICE_LABELS[params.service]}`;
  const { renewal } = stats;

  const points = stats.series.map((point) => ({
    label: bucketLabel(point.from, meta.granularity, spansYears),
    inProgress: point.inProgress,
    line: point.active,
    previousLine: null,
    up: point.joins,
    down: point.leaves,
    downPending: point.leavesPending,
  }));
  const conclusion = [`${formatCount(stats.active.current)} al final`, delta ? `${delta.figure} ${delta.context}` : ""]
    .filter(Boolean)
    .join(", ");
  const chartLabel = `Clientes activos por ${noun} del ${formatShortDate(meta.period.from, true)} al ${formatShortDate(meta.period.to, true)}: ${conclusion}. Los datos exactos están en Ver datos.`;

  // Rehab has no plans, so it never has a renewal: it is left out even if the API were to send it.
  const renewalRows = stats.renewalByService.filter(
    (row) => SERVICES_WITH_PLANS.includes(row.service) && (params.service === SERVICE_PARAMS.ALL || row.service === params.service),
  );

  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted">
        {`${formatShortDate(meta.period.from, withYear)} – ${formatShortDate(meta.period.to, withYear)} · Clientes con plan o reserva suelta ese día`}
      </p>
      <h2 className="m-0 font-display text-lg font-extrabold lg:text-[22px]">{`¿Crecemos o perdemos gente, y por qué?${serviceSuffix}`}</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <KpiTile
          label="Clientes activos hoy"
          info={INFO.active}
          value={formatCount(stats.active.current)}
          metric={stats.active}
          note={
            <>
              {leavesNote(stats)}
              {delta ? (
                <>
                  {" · "}
                  <span className={cn(TONE_CLASS[delta.tone])}>{delta.figure}</span> <span>{delta.context}</span>
                </>
              ) : null}
            </>
          }
          {...kpi}
        />
        <KpiTile
          label="Renovación"
          info={INFO.renewal}
          value={formatShare(renewal.current)}
          metric={renewal}
          note={`${renewal.renewed} de ${renewal.due}${renewal.pending > 0 ? ` · ${renewal.pending} en curso` : ""}`}
          {...kpi}
        />
        <KpiTile
          label="En pausa"
          info={INFO.paused}
          value={formatCount(stats.paused.current)}
          metric={stats.paused}
          downIsGood
          note="no son bajas"
          {...kpi}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0 lg:col-span-2">
          <NegocioCard title={`Activos, altas y bajas por ${noun}`}>
            <LazyLineWithBarsChart label={chartLabel} points={points} previousName={null} />
            <ChartDataTable
              caption={`Activos, altas y bajas por ${noun}`}
              columns={[
                GRANULARITY_LABELS[meta.granularity],
                "Activos",
                "Altas",
                "Bajas",
                "Bajas en curso",
              ]}
              rows={stats.series.map((point) => [
                `${bucketRange(point, spansYears)}${point.inProgress ? " (en curso)" : ""}`,
                point.active,
                point.joins,
                point.leaves,
                point.leavesPending,
              ])}
            />
          </NegocioCard>
        </div>
        <NegocioCard title="Renovación por servicio">
          {renewalRows.some((row) => row.due > 0) ? (
            <BarList
              format={String}
              items={renewalRows.map((row) => ({
                label: (
                  <span className="flex items-center gap-1.5">
                    <ServiceDot service={row.service} />
                    {SERVICE_LABELS[row.service]}
                  </span>
                ),
                value: row.renewed,
                fill: row.rate,
                text: formatShare(row.rate),
                note: `${row.renewed} de ${row.due}`,
                color: SERVICE_COLORS[row.service],
              }))}
            />
          ) : (
            <p className="text-sm text-muted">
              {params.service === SERVICE_PARAMS.REHAB ? "Rehab no tiene planes, así que no tiene renovación." : "Ningún plan venció en el período."}
            </p>
          )}
        </NegocioCard>
        <NegocioCard title="Por qué pausan">
          {stats.pauseReasons.length > 0 ? (
            <BarList
              format={String}
              items={stats.pauseReasons.map((row) => ({ label: pauseReasonLabel(row.reason), value: row.count }))}
            />
          ) : (
            <p className="text-sm text-muted">Nadie está en pausa.</p>
          )}
        </NegocioCard>
      </div>
    </div>
  );
}
