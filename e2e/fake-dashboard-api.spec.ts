import { expect, test, type APIRequestContext } from "@playwright/test";

import type { ApiErrorBody } from "@/lib/api/errors";
import type { ClientsStatsDto, MoneyStatsDto, SlotsStatsDto } from "@/lib/api/types";

import { answerStats, dataSinceFor, type StatsKind } from "./support/fake-dashboard-stats";
import { businessDateFromToday } from "./support/offline-charges-fixtures";
import { OWNER_COOKIE, SCENARIO_COOKIE } from "./support/scenarios";

// The fake API of the staff dashboard answers what the contract of the back says, so the front's pages can be tested
// against it. These tests check the fake itself, with no browser.

const ORIGIN = `http://localhost:${Number(process.env.E2E_API_PORT ?? 4300)}`;
const STATS = `${ORIGIN}/api/v1/staff/dashboard/stats`;

function as(scenario: string): { Cookie: string } {
  return { Cookie: `${SCENARIO_COOKIE}=${scenario}; ${OWNER_COOKIE}=dashboard-fake-spec` };
}

async function stats<Body>(request: APIRequestContext, scenario: string, kind: string, query = ""): Promise<{ status: number; body: Body }> {
  const response = await request.get(`${STATS}/${kind}${query}`, { headers: as(scenario) });
  return { status: response.status(), body: (await response.json()) as Body };
}

const DAY_MS = 86_400_000;
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// The first and the last day of the month before this one, in Montevideo.
function lastMonth(): { from: string; to: string } {
  const today = businessDateFromToday(0);
  const to = addDays(`${today.slice(0, 8)}01`, -1);
  return { from: `${to.slice(0, 8)}01`, to };
}

// The fake answering on a day of our choice: no HTTP, so the tests that depend on the weekday or the month do not
// depend on the day they run.
function on<Body>(today: string, kind: StatsKind, query: string): Body {
  const response = answerStats(kind, new URL(`${STATS}/${kind}${query}`), { empty: false, down: false, today });
  expect(response.status).toBe(200);
  return response.body as Body;
}

test.describe("fake dashboard stats: the period and the comparison", () => {
  test("answers last month against the month before, by default", async ({ request }) => {
    const { status, body } = await stats<MoneyStatsDto>(request, "staff-dashboard", "money");

    expect(status).toBe(200);
    const month = lastMonth();
    expect(body.meta.period).toEqual({ ...month, inProgress: false });
    expect(body.meta.comparison?.to).toBe(addDays(month.from, -1));
    expect(body.meta.comparison?.inProgress).toBe(false);
    expect(body.meta.dataSince).toBe(dataSinceFor("money", businessDateFromToday(0)));
  });

  test("a comparison that starts before the first data says it has none, and its numbers are null", async ({ request }) => {
    // A fixed range of 2026, so the test says the same on any day it runs.
    const { body } = await stats<MoneyStatsDto>(request, "staff-dashboard", "money", "?period=custom&from=2026-01-01&to=2026-10-31&compare=last_year");

    expect(body.meta.comparison?.hasData).toBe(false);
    expect(body.collected.previous).toBeNull();
    expect(body.collected.change).toBeNull();
    expect(body.series.every((point) => point.previousTotal === null)).toBe(true);
  });

  test("a comparison with data has a previous number and a change", async ({ request }) => {
    const { body } = await stats<MoneyStatsDto>(request, "staff-dashboard", "money", "?period=last_month&compare=previous");

    expect(body.meta.comparison?.hasData).toBe(true);
    expect(body.collected.previous).not.toBeNull();
    expect(body.collected.changeUnit).toBe("percent");
    expect(body.collected.change).toBe(Math.round(((body.collected.current! - body.collected.previous!) / body.collected.previous!) * 100));
  });

  test("compare=none has no comparison at all", async ({ request }) => {
    const { body } = await stats<SlotsStatsDto>(request, "staff-dashboard", "slots", "?compare=none");

    expect(body.meta.comparison).toBeNull();
    expect(body.occupancy.previous).toBeNull();
    expect(body.occupancy.change).toBeNull();
  });

  test("this month is in progress and starts on the 1st", async ({ request }) => {
    const { body } = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients", "?period=this_month");

    expect(body.meta.period.from).toBe(`${businessDateFromToday(0).slice(0, 8)}01`);
    expect(body.meta.period.to).toBe(businessDateFromToday(0));
    expect(body.meta.period.inProgress).toBe(true);
  });

  test("ratios change in points and counts in percent", async ({ request }) => {
    const { body } = await stats<SlotsStatsDto>(request, "staff-dashboard", "slots");

    expect(body.occupancy.changeUnit).toBe("points");
    expect(body.cancellations.changeUnit).toBe("percent");
    expect(body.occupancy.change).toBe(Math.round((body.occupancy.current! - body.occupancy.previous!) * 100));
  });
});

test.describe("fake dashboard stats: this week and the bars in progress", () => {
  test("this week on a Tuesday is compared with the same days of the week before", async () => {
    const body = on<MoneyStatsDto>("2026-11-03", "money", "?period=this_week");

    expect(body.meta.period).toEqual({ from: "2026-11-02", to: "2026-11-03", inProgress: true });
    expect(body.meta.comparison).toMatchObject({ from: "2026-10-26", to: "2026-10-27" });
  });

  test("this week on a Sunday is compared with the whole week before, and its last bar is in progress", async () => {
    const body = on<MoneyStatsDto>("2026-11-08", "money", "?period=this_week");

    expect(body.meta.period).toEqual({ from: "2026-11-02", to: "2026-11-08", inProgress: true });
    expect(body.meta.comparison).toMatchObject({ from: "2026-10-26", to: "2026-11-01" });
    expect(body.series.at(-1)?.inProgress).toBe(true);
  });

  test("a range that ended in the past does not mark its last bar in progress, even if its week is not over", async () => {
    const body = on<MoneyStatsDto>("2026-11-04", "money", "?period=custom&from=2026-10-20&to=2026-11-02&granularity=week");

    expect(body.meta.period.inProgress).toBe(false);
    expect(body.series.at(-1)).toMatchObject({ from: "2026-11-02", to: "2026-11-02", inProgress: false });
  });

  test("a range that reaches today has its last bar in progress and cut at today", async () => {
    const body = on<MoneyStatsDto>("2026-11-18", "money", "?period=this_month&granularity=week");

    expect(body.series.at(-1)).toMatchObject({ from: "2026-11-16", to: "2026-11-18", inProgress: true });
    expect(body.series.slice(0, -1).every((point) => !point.inProgress)).toBe(true);
  });

  test("a bar of the comparison that would start after the comparison ends is null (March against February)", async () => {
    const money = on<MoneyStatsDto>("2026-04-15", "money", "?period=last_month&granularity=day");
    const clients = on<ClientsStatsDto>("2026-04-15", "clients", "?period=last_month&granularity=day");

    for (const series of [money.series.map((point) => point.previousTotal), clients.series.map((point) => point.previousActive)]) {
      expect(series).toHaveLength(31);
      // February has 28 days: the last three days of March have no day of February to line up with.
      expect(series[27]).not.toBeNull();
      expect(series.slice(28)).toEqual([null, null, null]);
    }
  });
});

test.describe("fake dashboard stats: grouping", () => {
  test("ten months go by month by default and offer week and month", async ({ request }) => {
    // A fixed range, not this_year: that one is a month long in January and a year long in December.
    const { body } = await stats<MoneyStatsDto>(request, "staff-dashboard", "money", "?period=custom&from=2026-01-01&to=2026-10-31");

    expect(body.meta.granularity).toBe("month");
    expect(body.meta.granularityOptions).toEqual(["week", "month"]);
    // The range ended in the past: its last bar is not in progress.
    expect(body.series.at(-1)?.inProgress).toBe(false);
  });

  test("the grouping options follow the length: day up to 92 days, week from 8 to 400, month from 45", async ({ request }) => {
    const options = async (from: string, to: string) =>
      (await stats<MoneyStatsDto>(request, "staff-dashboard", "money", `?period=custom&from=${from}&to=${to}`)).body.meta.granularityOptions;

    expect(await options("2026-01-01", "2026-04-02")).toEqual(["day", "week", "month"]); // 92 days
    expect(await options("2026-01-01", "2026-04-03")).toEqual(["week", "month"]); // 93 days
    expect(await options("2025-01-01", "2026-02-04")).toEqual(["week", "month"]); // 400 days
    expect(await options("2025-01-01", "2026-02-05")).toEqual(["month"]); // 401 days
  });

  test("a 15-day range goes by week and offers day and week; granularity picks another one it offers", async ({ request }) => {
    const query = "?period=custom&from=2026-10-05&to=2026-10-19";
    const byWeek = await stats<MoneyStatsDto>(request, "staff-dashboard", "money", query);
    const byDay = await stats<MoneyStatsDto>(request, "staff-dashboard", "money", `${query}&granularity=day`);

    expect(byWeek.body.meta.granularity).toBe("week");
    expect(byWeek.body.meta.granularityOptions).toEqual(["day", "week"]);
    expect(byWeek.body.series.map((point) => point.from)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(byDay.body.series).toHaveLength(15);
  });

  test("the compared period is as long as the period for a custom range", async ({ request }) => {
    const { body } = await stats<MoneyStatsDto>(request, "staff-dashboard", "money", "?period=custom&from=2026-10-05&to=2026-10-19");

    expect(body.meta.comparison).toMatchObject({ from: "2026-09-20", to: "2026-10-04" });
  });
});

test.describe("fake dashboard stats: money adds up", () => {
  test("the series, the services and the methods all add up to Cobrado", async ({ request }) => {
    const { body } = await stats<MoneyStatsDto>(request, "staff-dashboard", "money");

    const seriesTotal = body.series.reduce((total, point) => total + point.total, 0);
    const servicesTotal = body.byService.reduce((total, row) => total + row.amount, 0);
    expect(seriesTotal).toBe(body.collected.current);
    expect(servicesTotal).toBe(body.collected.current);
    // The methods are rounded one by one: a peso of difference at most.
    expect(Math.abs(body.byMethod.reduce((total, row) => total + row.amount, 0) - body.collected.current!)).toBeLessThanOrEqual(2);
    for (const point of body.series) {
      expect(point.total).toBe(point.byService.performance + point.byService.rehab + point.byService.recovery);
    }
  });

  test("the service filter keeps only that service", async ({ request }) => {
    const all = await stats<MoneyStatsDto>(request, "staff-dashboard", "money");
    const rehab = await stats<MoneyStatsDto>(request, "staff-dashboard", "money", "?service=rehab");

    expect(rehab.body.byService.map((row) => row.service)).toEqual(["rehab"]);
    expect(rehab.body.collected.current).toBeLessThan(all.body.collected.current!);
    expect(rehab.body.series.every((point) => point.byService.performance === 0 && point.byService.recovery === 0)).toBe(true);
  });
});

test.describe("fake dashboard stats: Turnos and Clientes", () => {
  test("Turnos has the five blocks of the contract, and the filter keeps only its service in the seats", async ({ request }) => {
    const all = await stats<SlotsStatsDto>(request, "staff-dashboard", "slots");
    const recovery = await stats<SlotsStatsDto>(request, "staff-dashboard", "slots", "?service=recovery");

    expect(all.body.seats.map((row) => row.service)).toEqual(["performance", "rehab", "recovery"]);
    expect(all.body.cancellationsByReason.map((row) => row.reason)).toContain("staff_unknown");
    expect(all.body.busyHours.length).toBeGreaterThan(0);
    expect(all.body.heatmap.length).toBeGreaterThan(0);
    expect(all.body.sameDayCancellations).toBeGreaterThan(0);
    expect(recovery.body.seats.map((row) => row.service)).toEqual(["recovery"]);
  });

  test("Clientes has a series of the same buckets, renewal without Rehab, and an empty renewal for Rehab", async ({ request }) => {
    const all = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients");
    const rehab = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients", "?service=rehab");

    expect(all.body.series.length).toBeGreaterThan(1);
    expect(all.body.renewalByService.map((row) => row.service)).toEqual(["performance", "recovery"]);
    expect(all.body.renewal.pending).toBeGreaterThan(0);
    expect(rehab.body.renewalByService).toEqual([]);
    expect(rehab.body.renewal.current).toBeNull();
  });

  test("Clientes accepts the four new ranges and returns series and active.previous", async ({ request }) => {
    const today = businessDateFromToday(0);
    const from = { last_30_days: addDays(today, -29), all_time: "2026-01-01" } as const;

    for (const period of ["last_30_days", "last_3_months", "last_6_months", "all_time"] as const) {
      const { status, body } = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients", `?period=${period}&compare=previous`);

      expect(status, period).toBe(200);
      expect(body.meta.period.to, period).toBe(today);
      expect(body.meta.period.inProgress, period).toBe(true);
      expect(body.series.length, period).toBeGreaterThan(0);
      if (period in from) expect(body.meta.period.from, period).toBe(from[period as keyof typeof from]);
    }
    // The data of the fake start seven months ago: the window before 30 days or 3 months has data, the one before 6 months does not.
    for (const period of ["last_30_days", "last_3_months"]) {
      const { body } = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients", `?period=${period}&compare=previous`);

      expect(body.meta.comparison?.hasData, period).toBe(true);
      expect(body.active.previous, period).not.toBeNull();
    }
  });

  test("all_time groups by week up to 400 days and by month after that", async () => {
    expect(on<ClientsStatsDto>("2026-11-19", "clients", "?period=all_time&granularity=week").meta.granularity).toBe("week");
    expect(on<ClientsStatsDto>("2027-03-01", "clients", "?period=all_time&granularity=week").meta.granularity).toBe("month");
  });

  test("Turnos gives booked, offered, occupancy, a total per hour and a rate per cell, null when nothing was offered", async ({ request }) => {
    const all = await stats<SlotsStatsDto>(request, "staff-dashboard", "slots");
    const rehab = await stats<SlotsStatsDto>(request, "staff-dashboard", "slots", "?service=rehab");

    const seatsBooked = all.body.seats.reduce((total, row) => total + row.booked, 0);
    expect(all.body.occupancy.booked).toBe(seatsBooked);
    expect(all.body.occupancy.offered).toBe(all.body.seats.reduce((total, row) => total + row.offered, 0));
    expect(all.body.seats.every((row) => row.occupancy === Math.round((row.booked / row.offered) * 100) / 100)).toBe(true);
    for (const hour of all.body.busyHours) expect(hour.total).toBe(hour.byService.performance + hour.byService.rehab + hour.byService.recovery);
    expect(all.body.heatmap.every((cell) => cell.rate === (cell.offered === 0 ? null : Math.round((cell.booked / cell.offered) * 100) / 100))).toBe(true);
    // One service: its seats, and an hour only counts that service.
    expect(rehab.body.occupancy).toMatchObject({ booked: 75, offered: 100 });
    for (const hour of rehab.body.busyHours) expect(hour.total).toBe(hour.byService.rehab);
  });

  test("Clientes with Rehab has leaves and renewal null (Rehab has no plans), never 0", async ({ request }) => {
    const { body } = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients", "?service=rehab");

    expect(body.leaves).toMatchObject({ current: null, previous: null, change: null });
    expect(body.renewal).toMatchObject({ current: null, previous: null, change: null, renewed: 0, due: 0, pending: 0 });
    expect(body.renewalByService).toEqual([]);
    expect(body.series.every((point) => point.leaves === 0)).toBe(true);
    expect(body.joins.current).not.toBeNull();
  });

  test("clients: every response carries leaves.pending, staffLeaves and leavesPending", async ({ request }) => {
    for (const [scenario, query] of [
      ["staff-dashboard", ""],
      ["staff-dashboard", "?service=performance"],
      ["staff-dashboard", "?service=recovery"],
      ["staff-dashboard", "?period=last_month"],
      ["staff-dashboard-empty", ""],
    ] as const) {
      const { body } = await stats<ClientsStatsDto>(request, scenario, "clients", query);

      expect(typeof body.staffLeaves.current).toBe("number");
      expect(typeof body.leaves.pending).toBe("number");
      expect(body.series.every((point) => typeof point.leavesPending === "number")).toBe(true);
      // The bars in progress add up to the card.
      expect(body.series.reduce((total, point) => total + point.leavesPending, 0)).toBe(body.leaves.pending);
    }
    // All of them are still inside the grace days only in a period that ends today.
    const thisMonth = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients", "?period=this_month");
    const lastMonth = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients", "?period=last_month");
    expect(thisMonth.body.leaves.pending).toBe(5);
    expect(thisMonth.body.staffLeaves.current).toBe(1);
    expect(lastMonth.body.leaves.pending).toBe(0);
  });

  test("rehab: leaves and leaves.pending are null, staffLeaves is a number", async ({ request }) => {
    const { body } = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients", "?service=rehab");

    expect(body.leaves).toMatchObject({ current: null, pending: null });
    expect(body.staffLeaves.current).toBe(1);
    expect(body.series.every((point) => point.leavesPending === 0)).toBe(true);
  });

  test("Clientes with Performance or Recovery counts only that service, and its renewal is the one of its row", async ({ request }) => {
    const all = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients");
    for (const service of ["performance", "recovery"] as const) {
      const { body } = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients", `?service=${service}`);

      expect(body.active.current).toBeLessThan(all.body.active.current!);
      expect(body.paused.current).toBeLessThanOrEqual(all.body.paused.current!);
      expect(body.renewalByService.map((row) => row.service)).toEqual([service]);
      expect(body.renewal).toMatchObject({ renewed: body.renewalByService[0].renewed, due: body.renewalByService[0].due });
      expect(body.renewal.current).toBe(body.renewalByService[0].rate);
    }
  });

  test("the reasons for pausing add up to the clients in pause, for every service", async ({ request }) => {
    for (const query of ["", "?service=performance", "?service=rehab", "?service=recovery"]) {
      const { body } = await stats<ClientsStatsDto>(request, "staff-dashboard", "clients", query);

      expect(body.pauseReasons.reduce((total, row) => total + row.count, 0), query || "all").toBe(body.paused.current);
    }
  });
});

test.describe("fake dashboard stats: errors and the empty business", () => {
  for (const query of ["?period=custom&from=2026-10-19&to=2026-10-05", "?period=custom&from=2020-01-01&to=2026-10-05", "?period=custom"]) {
    test(`refuses the range ${query || "(none)"} with DASHBOARD_INVALID_RANGE`, async ({ request }) => {
      const { status, body } = await stats<ApiErrorBody>(request, "staff-dashboard", "money", query);

      expect(status).toBe(400);
      expect(body.code).toBe("DASHBOARD_INVALID_RANGE");
    });
  }

  test("refuses a range that ends tomorrow", async ({ request }) => {
    const { status, body } = await stats<ApiErrorBody>(
      request,
      "staff-dashboard",
      "slots",
      `?period=custom&from=2026-10-05&to=${businessDateFromToday(1)}`,
    );

    expect(status).toBe(400);
    expect(body.code).toBe("DASHBOARD_INVALID_RANGE");
  });

  test("refuses a value that is not in the contract", async ({ request }) => {
    const { status } = await stats<ApiErrorBody>(request, "staff-dashboard", "money", "?period=forever");

    expect(status).toBe(400);
  });

  test("staff-dashboard-money-currency answers 409 DASHBOARD_UNSUPPORTED_CURRENCY on money only", async ({ request }) => {
    const money = await stats<ApiErrorBody>(request, "staff-dashboard-money-currency", "money");
    expect(money.status).toBe(409);
    expect(money.body.code).toBe("DASHBOARD_UNSUPPORTED_CURRENCY");
    expect((await stats<SlotsStatsDto>(request, "staff-dashboard-money-currency", "slots")).status).toBe(200);
  });

  test("staff-dashboard-money-down fails only the money stats", async ({ request }) => {
    expect((await stats<ApiErrorBody>(request, "staff-dashboard-money-down", "money")).status).toBe(500);
    expect((await stats<SlotsStatsDto>(request, "staff-dashboard-money-down", "slots")).status).toBe(200);
    expect((await stats<ClientsStatsDto>(request, "staff-dashboard-money-down", "clients")).status).toBe(200);
  });

  test("staff-dashboard-empty has no data: zeros, no ratios, no comparison with data", async ({ request }) => {
    const money = await stats<MoneyStatsDto>(request, "staff-dashboard-empty", "money");
    const slots = await stats<SlotsStatsDto>(request, "staff-dashboard-empty", "slots");
    const clients = await stats<ClientsStatsDto>(request, "staff-dashboard-empty", "clients");

    expect(money.body.meta.dataSince).toBeNull();
    expect(money.body.meta.comparison?.hasData).toBe(false);
    expect(money.body.collected.current).toBe(0);
    expect(money.body.byService.every((row) => row.share === null)).toBe(true);
    expect(slots.body.occupancy.current).toBeNull();
    expect(slots.body.heatmap).toEqual([]);
    expect(clients.body.renewal.current).toBeNull();
    expect(clients.body.pauseReasons).toEqual([]);
  });

  test("clients with no data sends the two zero renewal rows", async ({ request }) => {
    const { body } = await stats<ClientsStatsDto>(request, "staff-dashboard-empty", "clients");

    // Like the back: Performance and Recovery, zeros included, never an empty list.
    expect(body.renewalByService).toEqual([
      { service: "performance", renewed: 0, due: 0, rate: null },
      { service: "recovery", renewed: 0, due: 0, rate: null },
    ]);
    expect(body.leaves).toMatchObject({ current: 0, pending: 0 });
    expect(body.staffLeaves.current).toBe(0);
  });
});

test.describe("fake dashboard stats: seats still to come", () => {
  test("every seats row carries upcoming: 0 for a period that ended and some for one that reaches today", async () => {
    const ended = on<SlotsStatsDto>("2026-11-04", "slots", "?period=last_month");
    const reachingToday = on<SlotsStatsDto>("2026-11-04", "slots", "?period=this_month");

    expect(ended.seats.every((row) => row.upcoming === 0)).toBe(true);
    expect(reachingToday.seats.map((row) => row.upcoming)).toEqual([8, 0, 4]);
  });

  test("the seats add up as in the back contract, with and without upcoming", async () => {
    for (const period of ["last_month", "this_month"]) {
      for (const row of on<SlotsStatsDto>("2026-11-04", "slots", `?period=${period}`).seats) {
        expect(row.attended + row.notAttended + row.unmarked + row.upcoming, `${row.service}, ${period}`).toBe(row.booked);
        expect(row.booked + row.free, `${row.service}, ${period}`).toBe(row.offered);
      }
    }
  });
});

test.describe("fake dashboard stats: the same rules as the back", () => {
  test("last_12_months on 2028-03-01 compares with 2026-03-02..2027-03-01", async () => {
    const body = on<MoneyStatsDto>("2028-03-01", "money", "?period=last_12_months");

    expect(body.meta.period).toMatchObject({ from: "2027-03-02", to: "2028-03-01" });
    expect(body.meta.comparison).toMatchObject({ from: "2026-03-02", to: "2027-03-01" });
  });

  test("an impossible date like 2026-02-31 answers 400", async () => {
    const response = answerStats("money", new URL(`${STATS}/money?period=custom&from=2026-02-31&to=2026-03-10`), {
      empty: false,
      down: false,
      today: "2026-11-04",
    });

    expect(response.status).toBe(400);
  });

  test("perDay keeps cents and perActiveClient is in whole pesos", async () => {
    const body = on<MoneyStatsDto>("2026-11-04", "money", "?period=last_month");

    // October has 31 days: 180570 ÷ 31 = 5824.838…, rounded to cents like the back.
    expect(body.collected.current).toBe(180570);
    expect(body.perDay.current).toBe(5824.84);
    expect(Number.isInteger(body.perActiveClient.current!)).toBe(true);
  });
});
