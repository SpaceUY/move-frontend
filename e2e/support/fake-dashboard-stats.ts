import type {
  ClientsStatsDto,
  MetricValueDto,
  MoneyStatsDto,
  ServiceType,
  SlotsStatsDto,
  StatsGranularity,
  StatsMetaDto,
  StatsWindowDto,
} from "@/lib/api/types";

import { failure, type FakeResponse } from "./fake-checkout";
import { businessDateFromToday } from "./offline-charges-fixtures";

// The three stats routes of the staff dashboard (Negocio). The numbers are made up, but the windows, the grouping,
// the comparison and the errors follow the contract of the back (plan 2026-11-03, "API contract"), so the front's
// URL handling can be tested end to end. The first tests of the fake itself are in e2e/fake-dashboard-api.spec.ts.

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 1096;
const SERVICES: readonly ServiceType[] = ["performance", "rehab", "recovery"];

// `staff-dashboard` has data since 6 to 8 months ago (each tab counts from the first record of its own source, like the
// back), whatever day the tests run: "last month" compares with data and "last year" says "sin datos".
const DATA_SINCE_MONTHS = { money: 8, slots: 6, clients: 7 } as const;

const PERIODS = [
  "this_week",
  "this_month",
  "last_month",
  "this_year",
  "last_12_months",
  "last_30_days",
  "last_3_months",
  "last_6_months",
  "all_time",
  "custom",
] as const;

// Where "all_time" starts, like HISTORY_START in the back: before it only the plans still active in 2026 were imported.
const HISTORY_START = "2026-01-01";
const COMPARES = ["previous", "last_year", "none"] as const;
const GRANULARITIES: readonly StatsGranularity[] = ["day", "week", "month"];

const INVALID_RANGE = failure(400, "DASHBOARD_INVALID_RANGE", "El rango de fechas no es válido.");

const parse = (date: string): Date => new Date(`${date}T00:00:00Z`);
const format = (date: Date): string => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number): string => format(new Date(parse(date).getTime() + days * DAY_MS));
const diffDays = (from: string, to: string): number => Math.round((parse(to).getTime() - parse(from).getTime()) / DAY_MS);
const lengthOf = (window: { from: string; to: string }): number => diffDays(window.from, window.to) + 1;
const mondayOf = (date: string): string => addDays(date, -((parse(date).getUTCDay() + 6) % 7));
const firstOfMonth = (date: string): string => `${date.slice(0, 8)}01`;
const lastOfMonth = (date: string): string => {
  const next = parse(firstOfMonth(date));
  next.setUTCMonth(next.getUTCMonth() + 1);
  return format(new Date(next.getTime() - DAY_MS));
};

function shiftMonths(date: string, months: number): string {
  const shifted = parse(date);
  const day = shifted.getUTCDate();
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  const last = parse(lastOfMonth(format(shifted))).getUTCDate();
  shifted.setUTCDate(Math.min(day, last));
  return format(shifted);
}

/** The first day with data of one tab's source, as the fake gives it for `today`. */
export const dataSinceFor = (kind: keyof typeof DATA_SINCE_MONTHS, today: string): string => shiftMonths(today, -DATA_SINCE_MONTHS[kind]);

interface DateRange {
  from: string;
  to: string;
}

type Period = (typeof PERIODS)[number];
type Compare = (typeof COMPARES)[number];

interface Query {
  period: Period;
  from: string | null;
  to: string | null;
  compare: Compare;
  service: ServiceType | "all";
  granularity: StatsGranularity | null;
}

function readQuery(url: URL): Query | null {
  const get = (name: string) => url.searchParams.get(name);
  const period = (get("period") ?? "last_month") as Period;
  const compare = (get("compare") ?? "previous") as Compare;
  const service = (get("service") ?? "all") as Query["service"];
  const granularity = get("granularity") as StatsGranularity | null;
  if (!PERIODS.includes(period) || !COMPARES.includes(compare)) return null;
  if (service !== "all" && !SERVICES.includes(service)) return null;
  if (granularity !== null && !GRANULARITIES.includes(granularity)) return null;
  return { period, from: get("from"), to: get("to"), compare, service, granularity };
}

function periodWindow(query: Query, today: string): DateRange | null {
  switch (query.period) {
    case "this_week":
      return { from: mondayOf(today), to: today };
    case "this_month":
      return { from: firstOfMonth(today), to: today };
    case "last_month": {
      const inLastMonth = addDays(firstOfMonth(today), -1);
      return { from: firstOfMonth(inLastMonth), to: inLastMonth };
    }
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "last_12_months":
      return { from: addDays(shiftMonths(today, -12), 1), to: today };
    case "last_30_days":
      return { from: addDays(today, -29), to: today };
    case "last_3_months":
      return { from: addDays(shiftMonths(today, -3), 1), to: today };
    case "last_6_months":
      return { from: addDays(shiftMonths(today, -6), 1), to: today };
    case "all_time":
      return { from: HISTORY_START, to: today };
    case "custom": {
      const { from, to } = query;
      // The same checks as the back: both ends are dates, it does not end after today, it does not start after it
      // ends, and it is at most three years long.
      // A real calendar day: 2026-02-31 has the right shape but is not one (the back answers 400, so does the fake).
      const isDate = (value: string | null): value is string =>
        value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parse(value).getTime()) && format(parse(value)) === value;
      if (!isDate(from) || !isDate(to) || to > today || from > to || diffDays(from, to) + 1 > MAX_RANGE_DAYS) return null;
      return { from, to };
    }
  }
}

function comparisonWindow(query: Query, period: DateRange): DateRange | null {
  if (query.compare === "none") return null;
  if (query.compare === "last_year") return { from: shiftMonths(period.from, -12), to: shiftMonths(period.to, -12) };
  if (query.period === "last_month" || query.period === "this_month") {
    const from = shiftMonths(firstOfMonth(period.from), -1);
    // A month in progress is compared with the same number of days of the one before.
    return { from, to: query.period === "this_month" ? addDays(from, Math.min(lengthOf(period), lengthOf({ from, to: lastOfMonth(from) })) - 1) : lastOfMonth(from) };
  }
  if (query.period === "this_year" || query.period === "last_12_months") {
    return { from: shiftMonths(period.from, -12), to: shiftMonths(period.to, -12) };
  }
  // A week in progress is compared with the same days of the week before: on a Tuesday, Monday and Tuesday.
  if (query.period === "this_week") return { from: addDays(period.from, -7), to: addDays(period.to, -7) };
  const days = lengthOf(period);
  return { from: addDays(period.from, -days), to: addDays(period.from, -1) };
}

function granularityOptions(days: number): StatsGranularity[] {
  const options: StatsGranularity[] = [];
  if (days <= 92) options.push("day");
  if (days >= 8 && days <= 400) options.push("week");
  if (days >= 45) options.push("month");
  return options;
}

function autoGranularity(days: number): StatsGranularity {
  if (days <= 14) return "day";
  return days <= 120 ? "week" : "month";
}

interface Bucket extends DateRange {
  inProgress: boolean;
  /** Days from the start of the window to the start of the bucket: where the same bucket starts in the comparison. */
  offset: number;
}

function bucketsOf(window: DateRange, granularity: StatsGranularity, today: string): Bucket[] {
  const buckets: Bucket[] = [];
  let from = window.from;
  while (from <= window.to) {
    const naturalEnd =
      granularity === "day" ? from : granularity === "week" ? addDays(mondayOf(from), 6) : lastOfMonth(from);
    const to = naturalEnd < window.to ? naturalEnd : window.to;
    // In progress = the bar, cut at the end of the window, reaches today (D-2): a range that ended in the past has none.
    buckets.push({ from, to, inProgress: to >= today, offset: diffDays(window.from, from) });
    from = addDays(to, 1);
  }
  return buckets;
}

/** Where this bar starts in the comparison, cut at its end; null when that is after the comparison ends (March against February). */
function alignedPrevious(bucket: Bucket, compared: DateRange | null): DateRange | null {
  if (!compared) return null;
  const from = addDays(compared.from, bucket.offset);
  if (from > compared.to) return null;
  return { from, to: addDays(compared.from, Math.min(bucket.offset + lengthOf(bucket) - 1, lengthOf(compared) - 1)) };
}

function buildMeta(kind: keyof typeof DATA_SINCE_MONTHS, query: Query, period: DateRange, today: string, empty: boolean): { meta: StatsMetaDto; buckets: Bucket[] } {
  const days = lengthOf(period);
  const options = granularityOptions(days);
  const granularity = query.granularity && options.includes(query.granularity) ? query.granularity : autoGranularity(days);
  const compared = comparisonWindow(query, period);
  const dataSince = empty ? null : dataSinceFor(kind, today);
  const toWindow = (window: DateRange): StatsWindowDto => ({ ...window, inProgress: window.to >= today });
  return {
    meta: {
      period: toWindow(period),
      comparison: compared ? { ...toWindow(compared), hasData: dataSince !== null && compared.from >= dataSince } : null,
      dataSince,
      granularity,
      granularityOptions: options,
    },
    buckets: bucketsOf(period, granularity, today),
  };
}

// `change` as the back computes it: percent for counts and money, points for ratios, null with nothing to compare.
function metric(current: number | null, previous: number | null, unit: MetricValueDto["changeUnit"] = "percent"): MetricValueDto {
  const comparable = current !== null && previous !== null && (unit === "points" || previous !== 0);
  const change = !comparable
    ? null
    : unit === "points"
      ? Math.round((current - previous) * 100)
      : Math.round(((current - previous) / previous) * 100);
  return { current, previous, change, changeUnit: unit };
}

// What the comparison has: its numbers when it has data, nothing when it has not (or when it is off).
function previousOf(meta: StatsMetaDto, value: number | null): number | null {
  return meta.comparison?.hasData ? value : null;
}

// ---------- Plata ----------

const DAILY: Record<ServiceType, number> = { performance: 4500, rehab: 2300, recovery: 760 };
const WEEKDAY_FACTOR = [0, 1, 1, 1, 1, 1, 0.55]; // Sunday first
const METHOD_SHARES = { mercado_pago: 0.75, cash: 0.2, transfer: 0.05 } as const;

// The back rounds an average to cents; the per-client amount stays in whole pesos.
const roundToCents = (amount: number): number => Math.round(amount * 100) / 100;

function moneyOfDay(date: string, service: ServiceType): number {
  const wobble = 0.85 + ((parse(date).getTime() / DAY_MS) % 7) * 0.04;
  return Math.round((DAILY[service] * WEEKDAY_FACTOR[parse(date).getUTCDay()] * wobble) / 10) * 10;
}

function moneyOfWindow(window: DateRange, service: ServiceType): number {
  let total = 0;
  for (let day = window.from; day <= window.to; day = addDays(day, 1)) total += moneyOfDay(day, service);
  return total;
}

function moneyStats(query: Query, period: DateRange, compared: DateRange | null, today: string, empty: boolean): MoneyStatsDto {
  const { meta, buckets } = buildMeta("money", query, period, today, empty);
  const services = query.service === "all" ? SERVICES : [query.service];
  const sum = (window: DateRange) => (empty ? 0 : services.reduce((total, service) => total + moneyOfWindow(window, service), 0));
  const collected = sum(period);
  const previousCollected = compared ? sum(compared) : null;
  const days = lengthOf(period);
  const activeClients = empty ? 0 : 84;
  const perDay = roundToCents(collected / days);
  const perClient = activeClients === 0 ? null : Math.round(collected / activeClients / (days / 30));
  const refunds = empty ? 0 : Math.round((collected * 0.03) / 10) * 10;
  const rows = <Key extends string>(keys: readonly Key[], amountOf: (key: Key, window: DateRange) => number) =>
    keys.map((key) => {
      const amount = amountOf(key, period);
      const previousAmount = previousOf(meta, compared ? amountOf(key, compared) : null);
      return {
        amount,
        previousAmount,
        share: collected === 0 ? null : Math.round((amount / collected) * 100) / 100,
        change: metric(amount, previousAmount).change,
        key,
      };
    });

  return {
    meta,
    collected: metric(collected, previousOf(meta, previousCollected)),
    refunds: metric(refunds, previousOf(meta, previousCollected === null ? null : Math.round((previousCollected * 0.02) / 10) * 10)),
    perDay: metric(perDay, previousOf(meta, compared ? roundToCents(sum(compared) / lengthOf(compared)) : null)),
    perActiveClient: metric(perClient, previousOf(meta, perClient === null ? null : Math.round((perClient * 100) / 96))),
    byService: rows(services, (service, window) => (empty ? 0 : moneyOfWindow(window, service))).map(({ key, ...row }) => ({ service: key, ...row })),
    byMethod: rows(Object.keys(METHOD_SHARES) as (keyof typeof METHOD_SHARES)[], (method, window) => Math.round(sum(window) * METHOD_SHARES[method])).map(
      ({ key, ...row }) => ({ method: key, ...row }),
    ),
    series: buckets.map((bucket) => {
      const previous = alignedPrevious(bucket, compared);
      const byService = Object.fromEntries(SERVICES.map((service) => [service, empty || !services.includes(service) ? 0 : moneyOfWindow(bucket, service)])) as Record<ServiceType, number>;
      return {
        from: bucket.from,
        to: bucket.to,
        inProgress: bucket.inProgress,
        byService,
        total: Object.values(byService).reduce((total, value) => total + value, 0),
        previousTotal: previousOf(meta, previous ? sum(previous) : null),
      };
    }),
    approvedNotApplied: 0,
  };
}

// ---------- Turnos ----------

// A ratio as the back sends it: 0–1, and null when the denominator is 0 (never a division by zero).
const rateOf = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : Math.round((numerator / denominator) * 100) / 100;

// For a period that ended: attended + notAttended + unmarked = booked, and free = offered − booked, like the back.
const SEAT_COUNTS = [
  { service: "performance", offered: 200, booked: 150, attended: 132, notAttended: 12, unmarked: 6 },
  { service: "rehab", offered: 100, booked: 75, attended: 65, notAttended: 10, unmarked: 0 },
  { service: "recovery", offered: 80, booked: 55, attended: 47, notAttended: 5, unmarked: 3 },
] as const;

// Seats booked for slots that have not started: only a period that reaches today has them, like the back. They are
// part of `booked`, so they come out of `attended` and the parts still add up.
const UPCOMING_SEATS: Record<ServiceType, number> = { performance: 8, rehab: 0, recovery: 4 };

const seatsOf = (row: (typeof SEAT_COUNTS)[number], upcoming: number): SlotsStatsDto["seats"][number] => ({
  ...row,
  attended: row.attended - upcoming,
  upcoming,
  free: row.offered - row.booked,
  occupancy: rateOf(row.booked, row.offered),
});

const BUSY_HOURS_BY_SERVICE = [7, 8, 9, 10, 11, 12, 17, 18, 19, 20].map((hour, index) => ({
  hour,
  byService: { performance: 12 + ((index * 7) % 23), rehab: 5 + ((index * 3) % 11), recovery: (index * 5) % 9 },
}));

// Monday to Saturday; the lunch hours and Saturday afternoons are empty, the 18:00 of Monday to Thursday is full.
const HEATMAP: SlotsStatsDto["heatmap"] = [1, 2, 3, 4, 5, 6].flatMap((isoWeekday) =>
  [7, 8, 9, 10, 11, 12, 17, 18, 19, 20].flatMap((hour) => {
    if (isoWeekday === 6 && hour >= 12) return [];
    const offered = 8;
    const booked = hour === 18 && isoWeekday <= 4 ? 8 : Math.min(offered, (isoWeekday * 3 + hour) % 9);
    return [{ isoWeekday, hour, offered, booked, rate: rateOf(booked, offered) }];
  }),
);

const CANCELLATIONS_BY_REASON: SlotsStatsDto["cancellationsByReason"] = [
  { reason: "client", count: 15, sameDay: 6 },
  { reason: "staff", count: 4, sameDay: 1 },
  { reason: "studio_closed", count: 2, sameDay: 0 },
  { reason: "deactivation", count: 1, sameDay: 0 },
  { reason: "staff_unknown", count: 1, sameDay: 1 },
];

function slotsStats(query: Query, period: DateRange, today: string, empty: boolean): SlotsStatsDto {
  const { meta } = buildMeta("slots", query, period, today, empty);
  const services = query.service === "all" ? SERVICES : [query.service];
  const ratio = (current: number | null, previous: number, unit: "points") => metric(empty ? null : current, empty ? null : previousOf(meta, previous), unit);
  const shownSeats = empty
    ? services.map((service) => ({ service, offered: 0, booked: 0, occupancy: null, attended: 0, notAttended: 0, unmarked: 0, upcoming: 0, free: 0 }))
    : SEAT_COUNTS.filter((row) => services.includes(row.service)).map((row) => seatsOf(row, meta.period.inProgress ? UPCOMING_SEATS[row.service] : 0));
  const booked = shownSeats.reduce((total, row) => total + row.booked, 0);
  const offered = shownSeats.reduce((total, row) => total + row.offered, 0);
  return {
    meta,
    occupancy: { ...ratio(rateOf(booked, offered), 0.75, "points"), booked, offered },
    attendance: ratio(0.9, 0.89, "points"),
    cancellations: metric(empty ? 0 : 23, empty ? null : previousOf(meta, 27)),
    sameDayCancellations: empty ? 0 : 8,
    seats: shownSeats,
    cancellationsByReason: empty ? CANCELLATIONS_BY_REASON.map((row) => ({ ...row, count: 0, sameDay: 0 })) : CANCELLATIONS_BY_REASON,
    busyHours: empty
      ? []
      : BUSY_HOURS_BY_SERVICE.map(({ hour, byService }) => {
          const shown = Object.fromEntries(SERVICES.map((service) => [service, services.includes(service) ? byService[service] : 0])) as Record<ServiceType, number>;
          return { hour, byService: shown, total: Object.values(shown).reduce((total, count) => total + count, 0) };
        }),
    heatmap: empty ? [] : HEATMAP,
  };
}

// ---------- Clientes ----------

// What the back counts for each choice of the service filter (D-1). A client can be active in more than one service
// and counts once in "all", so the services add up to more than "all". Rehab has no plans: it has no leaves (null,
// not 0) and no renewal. `staffLeaves` are the clients the staff deactivated: Rehab has them too. `pending` are the
// leaves still inside the grace days: only a period that ends today has any (null with Rehab, like `leaves`).
interface ClientNumbers {
  active: [current: number, previous: number];
  joins: [current: number, previous: number];
  leaves: [current: number, previous: number] | null;
  pending: number | null;
  staffLeaves: [current: number, previous: number];
  paused: [current: number, previous: number];
  renewal: { renewed: number; due: number; pending: number; previous: number } | null;
}

const CLIENT_NUMBERS: Record<ServiceType | "all", ClientNumbers> = {
  all: { active: [84, 79], joins: [9, 7], leaves: [4, 3], pending: 5, staffLeaves: [1, 2], paused: [17, 16], renewal: { renewed: 17, due: 25, pending: 4, previous: 0.65 } },
  performance: { active: [50, 47], joins: [5, 4], leaves: [3, 2], pending: 3, staffLeaves: [1, 1], paused: [9, 8], renewal: { renewed: 11, due: 14, pending: 3, previous: 0.62 } },
  rehab: { active: [22, 20], joins: [2, 2], leaves: null, pending: null, staffLeaves: [1, 1], paused: [5, 5], renewal: null },
  recovery: { active: [18, 17], joins: [2, 1], leaves: [1, 1], pending: 1, staffLeaves: [0, 1], paused: [4, 3], renewal: { renewed: 6, due: 11, pending: 1, previous: 0.7 } },
};

const PAUSE_REASONS: ClientsStatsDto["pauseReasons"] = [
  { reason: "injury", count: 5 },
  { reason: "vacation", count: 4 },
  { reason: "no_time", count: 3 },
  { reason: "temporary_pause", count: 2 },
  { reason: "return_later", count: 2 },
  { reason: "moving", count: 1 },
];

// How many of a period's pending leaves sit in each bar: the last two bars of a period that ends today hold them all
// (60 % in the last one), the closed bars of the past none. The bars add up to the card.
function pendingPerBar(total: number, bars: number): number[] {
  const last = bars > 1 ? Math.ceil(total * 0.6) : total;
  return Array.from({ length: bars }, (_, index) => (index === bars - 1 ? last : index === bars - 2 ? total - last : 0));
}

// The reasons of the clients in pause: as many as `total`, the commonest reasons first.
function reasonsFor(total: number): ClientsStatsDto["pauseReasons"] {
  let left = total;
  return PAUSE_REASONS.flatMap((row) => {
    const count = Math.min(row.count, left);
    left -= count;
    return count > 0 ? [{ reason: row.reason, count }] : [];
  });
}

function clientsStats(query: Query, period: DateRange, compared: DateRange | null, today: string, empty: boolean): ClientsStatsDto {
  const { meta, buckets } = buildMeta("clients", query, period, today, empty);
  const numbers = CLIENT_NUMBERS[query.service];
  const count = (pair: [number, number]) => metric(empty ? 0 : pair[0], empty ? null : previousOf(meta, pair[1]));
  // A bar is the service's share of the numbers of "all".
  const share = numbers.active[0] / CLIENT_NUMBERS.all.active[0];
  const renewal = numbers.renewal;
  const renewalRows: ClientsStatsDto["renewalByService"] = (["performance", "recovery"] as const)
    .filter((service) => query.service === "all" || query.service === service)
    .map((service) => {
      const row = CLIENT_NUMBERS[service].renewal!;
      return { service, renewed: row.renewed, due: row.due, rate: rateOf(row.renewed, row.due) };
    });
  const hasRenewal = !empty && renewal !== null;
  const pending = empty || numbers.pending === null ? 0 : meta.period.inProgress ? numbers.pending : 0;
  const pendingBars = pendingPerBar(pending, buckets.length);

  return {
    meta,
    active: count(numbers.active),
    joins: count(numbers.joins),
    leaves: numbers.leaves === null ? { ...metric(null, null), pending: null } : { ...count(numbers.leaves), pending },
    staffLeaves: count(numbers.staffLeaves),
    paused: count(numbers.paused),
    renewal: {
      ...metric(hasRenewal ? rateOf(renewal.renewed, renewal.due) : null, hasRenewal ? previousOf(meta, renewal.previous) : null, "points"),
      renewed: hasRenewal ? renewal.renewed : 0,
      due: hasRenewal ? renewal.due : 0,
      pending: hasRenewal ? renewal.pending : 0,
    },
    series: buckets.map((bucket, index) => ({
      from: bucket.from,
      to: bucket.to,
      inProgress: bucket.inProgress,
      active: empty ? 0 : Math.round((70 + index * 2) * share),
      previousActive: empty || alignedPrevious(bucket, compared) === null ? null : previousOf(meta, Math.round((66 + index * 2) * share)),
      joins: empty ? 0 : Math.round(((index * 3) % 4) * share),
      leaves: empty || numbers.leaves === null ? 0 : Math.round(((index * 5) % 3) * share),
      leavesPending: pendingBars[index],
    })),
    renewalByService: empty ? renewalRows.map((row) => ({ ...row, renewed: 0, due: 0, rate: null })) : renewalRows,
    pauseReasons: empty ? [] : reasonsFor(numbers.paused[0]),
  };
}

export type StatsKind = "money" | "slots" | "clients";

/**
 * `GET /staff/dashboard/stats/{money|slots|clients}`. `empty`: a business with nothing yet; `down`: the API fails;
 * `today`: a business date to answer on, for the specs that must not depend on the day they run.
 */
export function answerStats(kind: StatsKind, url: URL, options: { empty: boolean; down: boolean; today?: string }): FakeResponse {
  if (options.down) return failure(500, "INTERNAL", "Error interno.");
  const query = readQuery(url);
  if (!query) return failure(400, "VALIDATION_ERROR", "Parámetros inválidos.");
  const today = options.today ?? businessDateFromToday(0);
  const period = periodWindow(query, today);
  if (!period) return INVALID_RANGE;
  const compared = comparisonWindow(query, period);

  if (kind === "money") return { status: 200, body: moneyStats(query, period, compared, today, options.empty) };
  if (kind === "slots") return { status: 200, body: slotsStats(query, period, today, options.empty) };
  return { status: 200, body: clientsStats(query, period, compared, today, options.empty) };
}
