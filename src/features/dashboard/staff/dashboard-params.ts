import { ROUTES } from "@/config/constants/routes.constants";

export const DASHBOARD_VIEWS = { HOY: "hoy", NEGOCIO: "negocio" } as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[keyof typeof DASHBOARD_VIEWS];

export const DASHBOARD_TABS = { PLATA: "plata", TURNOS: "turnos", CLIENTES: "clientes" } as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[keyof typeof DASHBOARD_TABS];

export const PERIOD_PARAMS = {
  THIS_WEEK: "esta-semana",
  THIS_MONTH: "este-mes",
  LAST_MONTH: "mes-pasado",
  THIS_YEAR: "este-anio",
  LAST_12_MONTHS: "ultimos-12-meses",
  CUSTOM: "fechas",
} as const;
export type PeriodParam = (typeof PERIOD_PARAMS)[keyof typeof PERIOD_PARAMS];

export const COMPARE_PARAMS = { PREVIOUS: "anterior", LAST_YEAR: "anio-pasado", NONE: "no" } as const;
export type CompareParam = (typeof COMPARE_PARAMS)[keyof typeof COMPARE_PARAMS];

export const SERVICE_PARAMS = {
  ALL: "todos",
  PERFORMANCE: "performance",
  REHAB: "rehab",
  RECOVERY: "recovery",
} as const;
export type ServiceParam = (typeof SERVICE_PARAMS)[keyof typeof SERVICE_PARAMS];

export const GRANULARITY_PARAMS = { DAY: "dia", WEEK: "semana", MONTH: "mes" } as const;
export type GranularityParam = (typeof GRANULARITY_PARAMS)[keyof typeof GRANULARITY_PARAMS];

export const CLIENTS_RANGE_PARAMS = {
  LAST_30_DAYS: "30-dias",
  LAST_3_MONTHS: "3-meses",
  LAST_6_MONTHS: "6-meses",
  ALL: "todo",
} as const;
export type ClientsRangeParam = (typeof CLIENTS_RANGE_PARAMS)[keyof typeof CLIENTS_RANGE_PARAMS];

/** What `/staff` shows, all of it in the URL: `/staff?vista=negocio&tab=turnos&periodo=este-anio`. */
export interface DashboardParams {
  view: DashboardView;
  tab: DashboardTab;
  period: PeriodParam;
  from: string | null;
  to: string | null;
  compare: CompareParam;
  service: ServiceParam;
  granularity: GranularityParam | null;
  /** Only the Clientes tab reads it: its own range, always ending today. */
  clientsRange: ClientsRangeParam;
}

type RawParam = string | string[] | undefined;

const DEFAULT_TAB = DASHBOARD_TABS.PLATA;
const DEFAULT_PERIOD = PERIOD_PARAMS.LAST_MONTH;
const DEFAULT_COMPARE = COMPARE_PARAMS.PREVIOUS;
const DEFAULT_SERVICE = SERVICE_PARAMS.ALL;
const DEFAULT_CLIENTS_RANGE = CLIENTS_RANGE_PARAMS.LAST_6_MONTHS;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const firstOf = (value: RawParam): string | undefined => (Array.isArray(value) ? value[0] : value);

// The URL is the person's to edit: an unknown value becomes the default.
function pick<T extends string>(allowed: Record<string, T>, raw: RawParam, fallback: T): T {
  const value = firstOf(raw);
  return Object.values(allowed).find((option) => option === value) ?? fallback;
}

function validDate(raw: RawParam): string | null {
  const value = firstOf(raw);
  if (!value || !DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export function parseDashboardParams(raw: Record<string, RawParam>): DashboardParams {
  const period = pick(PERIOD_PARAMS, raw.periodo, DEFAULT_PERIOD);
  const from = period === PERIOD_PARAMS.CUSTOM ? validDate(raw.desde) : null;
  const to = period === PERIOD_PARAMS.CUSTOM ? validDate(raw.hasta) : null;
  // A custom period without a usable range has nothing to ask the API: it is the default period.
  const hasRange = from !== null && to !== null && from <= to;

  const granularityValue = firstOf(raw.agrupar);
  const granularity = Object.values(GRANULARITY_PARAMS).find((option) => option === granularityValue) ?? null;

  return {
    view: pick(DASHBOARD_VIEWS, raw.vista, DASHBOARD_VIEWS.HOY),
    tab: pick(DASHBOARD_TABS, raw.tab, DEFAULT_TAB),
    period: period === PERIOD_PARAMS.CUSTOM && !hasRange ? DEFAULT_PERIOD : period,
    from: hasRange ? from : null,
    to: hasRange ? to : null,
    compare: pick(COMPARE_PARAMS, raw.comparar, DEFAULT_COMPARE),
    service: pick(SERVICE_PARAMS, raw.servicio, DEFAULT_SERVICE),
    granularity,
    clientsRange: pick(CLIENTS_RANGE_PARAMS, raw.rango, DEFAULT_CLIENTS_RANGE),
  };
}

// The default view is the bare URL, so a switch or a way back never carries a value it does not need.
export function dashboardHref(params: DashboardParams): string {
  const search = new URLSearchParams();
  if (params.view === DASHBOARD_VIEWS.NEGOCIO) {
    search.set("vista", params.view);
    if (params.tab !== DEFAULT_TAB) search.set("tab", params.tab);
    if (params.period !== DEFAULT_PERIOD) search.set("periodo", params.period);
    if (params.period === PERIOD_PARAMS.CUSTOM && params.from && params.to) {
      search.set("desde", params.from);
      search.set("hasta", params.to);
    }
    if (params.compare !== DEFAULT_COMPARE) search.set("comparar", params.compare);
    if (params.service !== DEFAULT_SERVICE) search.set("servicio", params.service);
    if (params.granularity) search.set("agrupar", params.granularity);
    if (params.clientsRange !== DEFAULT_CLIENTS_RANGE) search.set("rango", params.clientsRange);
  }
  const qs = search.toString();
  return qs ? `${ROUTES.STAFF}?${qs}` : ROUTES.STAFF;
}

const API_PERIODS: Record<PeriodParam, string> = {
  [PERIOD_PARAMS.THIS_WEEK]: "this_week",
  [PERIOD_PARAMS.THIS_MONTH]: "this_month",
  [PERIOD_PARAMS.LAST_MONTH]: "last_month",
  [PERIOD_PARAMS.THIS_YEAR]: "this_year",
  [PERIOD_PARAMS.LAST_12_MONTHS]: "last_12_months",
  [PERIOD_PARAMS.CUSTOM]: "custom",
};

const API_COMPARES: Record<CompareParam, string> = {
  [COMPARE_PARAMS.PREVIOUS]: "previous",
  [COMPARE_PARAMS.LAST_YEAR]: "last_year",
  [COMPARE_PARAMS.NONE]: "none",
};

const API_GRANULARITIES: Record<GranularityParam, string> = {
  [GRANULARITY_PARAMS.DAY]: "day",
  [GRANULARITY_PARAMS.WEEK]: "week",
  [GRANULARITY_PARAMS.MONTH]: "month",
};

/** The query string of `GET /staff/dashboard/stats/*`, with the API's own names. */
export function toStatsQuery(params: DashboardParams): string {
  const search = new URLSearchParams({ period: API_PERIODS[params.period] });
  if (params.period === PERIOD_PARAMS.CUSTOM && params.from && params.to) {
    search.set("from", params.from);
    search.set("to", params.to);
  }
  search.set("compare", API_COMPARES[params.compare]);
  search.set("service", params.service === SERVICE_PARAMS.ALL ? "all" : params.service);
  if (params.granularity) search.set("granularity", API_GRANULARITIES[params.granularity]);
  return search.toString();
}

const CLIENTS_RANGE_QUERIES: Record<ClientsRangeParam, { period: string; granularity: string }> = {
  [CLIENTS_RANGE_PARAMS.LAST_30_DAYS]: { period: "last_30_days", granularity: "day" },
  [CLIENTS_RANGE_PARAMS.LAST_3_MONTHS]: { period: "last_3_months", granularity: "day" },
  [CLIENTS_RANGE_PARAMS.LAST_6_MONTHS]: { period: "last_6_months", granularity: "week" },
  [CLIENTS_RANGE_PARAMS.ALL]: { period: "all_time", granularity: "week" },
};

/**
 * The query of the Clientes tab: its range, always ending today, compared with the day before it starts.
 * It ignores `periodo`, `comparar` and `agrupar`, which belong to Plata and Turnos.
 */
export function toClientsStatsQuery(params: DashboardParams): string {
  const { period, granularity } = CLIENTS_RANGE_QUERIES[params.clientsRange];
  const search = new URLSearchParams({ period, compare: "previous" });
  search.set("service", params.service === SERVICE_PARAMS.ALL ? "all" : params.service);
  search.set("granularity", granularity);
  return search.toString();
}
