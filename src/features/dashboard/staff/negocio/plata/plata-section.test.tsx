import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

import { parseDashboardParams } from "../../dashboard-params";
import { nextRedirectError } from "../../hoy/today-fixtures";
import { ACTIVE_CLIENT_INFO } from "../info-texts";
import { getMoneyStats } from "./get-money-stats";
import { MONEY_STATS } from "./money-fixtures";
import { PlataSection } from "./plata-section";

vi.mock("./get-money-stats");

const getMoneyStatsMock = vi.mocked(getMoneyStats);
const PARAMS = parseDashboardParams({ vista: "negocio" });

vi.mock("recharts", () => import("../charts/fixed-size-recharts").then((module) => module.fixedSizeRecharts()));

beforeEach(() => {
  getMoneyStatsMock.mockReset();
});

describe("PlataSection", () => {
  it("asks the API with what the URL says", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);
    const params = parseDashboardParams({ vista: "negocio", periodo: "este-anio", comparar: "no", servicio: "rehab" });

    render(await PlataSection({ params }));

    expect(getMoneyStatsMock).toHaveBeenCalledWith(params);
  });

  it("opens with the period note and the question", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    render(await PlataSection({ params: PARAMS }));

    expect(screen.getByText("1 oct – 31 oct · comparado con 1 sep – 30 sep · Datos de plata desde 12 mar 2026 (el primer cobro registrado)")).toBeDefined();
    expect(screen.getByRole("heading", { name: "¿Cuánto entra y de dónde?" })).toBeDefined();
  });

  it("names the service in the question when the filter is on", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    render(await PlataSection({ params: parseDashboardParams({ vista: "negocio", servicio: "rehab" }) }));

    expect(screen.getByRole("heading", { name: "¿Cuánto entra y de dónde? · Rehab" })).toBeDefined();
  });

  it("shows the three numbers with how they moved", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    render(await PlataSection({ params: PARAMS }));

    const cobrado = screen.getByRole("heading", { name: "Cobrado" }).closest("article")!;
    expect(within(cobrado).getByText("$ 120.000,00")).toBeDefined();
    expect(within(cobrado).getByText("▲ 20%")).toBeDefined();
    expect(within(cobrado).getByText(/vs período anterior/)).toBeDefined();
    const perDay = screen.getByRole("heading", { name: "Promedio por día" }).closest("article")!;
    expect(within(perDay).getByText("$ 3.871,00")).toBeDefined();
    const perClient = screen.getByRole("heading", { name: "Por cliente activo" }).closest("article")!;
    expect(within(perClient).getByText("$ 2.400,00")).toBeDefined();
    expect(within(perClient).getByText("por mes")).toBeDefined();
    expect(within(perClient).getByText("▼ 4%")).toBeDefined();
  });

  it("shows Promedio por día with its cents: $ 4.958,06 is not rounded up", async () => {
    getMoneyStatsMock.mockResolvedValue({
      ...MONEY_STATS,
      perDay: { current: 4958.06, previous: 3333, change: 16, changeUnit: "percent" },
    });

    render(await PlataSection({ params: PARAMS }));

    const perDay = screen.getByRole("heading", { name: "Promedio por día" }).closest("article")!;
    expect(within(perDay).getByText("$ 4.958,06")).toBeDefined();
  });

  it("shows three rows of $ 100,10 as $ 100,10 each and the total as $ 300,30", async () => {
    getMoneyStatsMock.mockResolvedValue({
      ...MONEY_STATS,
      collected: { current: 300.3, previous: 100000, change: null, changeUnit: "percent" },
      byService: [
        { service: "performance", amount: 100.1, previousAmount: 60000, share: 0.33, change: null },
        { service: "rehab", amount: 100.1, previousAmount: 30000, share: 0.33, change: null },
        { service: "recovery", amount: 100.1, previousAmount: 10000, share: 0.33, change: null },
      ],
    });

    render(await PlataSection({ params: PARAMS }));

    const cobrado = screen.getByRole("heading", { name: "Cobrado" }).closest("article")!;
    expect(within(cobrado).getByText("$ 300,30")).toBeDefined();
    const table = screen.getByRole("table", { name: "Cobrado por servicio" });
    expect(within(table).getAllByText("$ 100,10")).toHaveLength(3);
  });

  it("shows a whole amount with two decimals: $ 153.700,00", async () => {
    getMoneyStatsMock.mockResolvedValue({
      ...MONEY_STATS,
      collected: { current: 153700, previous: 100000, change: 20, changeUnit: "percent" },
    });

    render(await PlataSection({ params: PARAMS }));

    const cobrado = screen.getByRole("heading", { name: "Cobrado" }).closest("article")!;
    expect(within(cobrado).getByText("$ 153.700,00")).toBeDefined();
  });

  it("shows refunds line only when there were refunds", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);
    const { unmount } = render(await PlataSection({ params: PARAMS }));
    expect(screen.getByText("Devoluciones −$ 3.500,00")).toBeDefined();
    unmount();

    getMoneyStatsMock.mockResolvedValue({ ...MONEY_STATS, refunds: { ...MONEY_STATS.refunds, current: 0 } });
    render(await PlataSection({ params: PARAMS }));
    expect(screen.queryByText(/Devoluciones/)).toBeNull();
  });

  it("the i of Cobrado says refunds include chargebacks", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    render(await PlataSection({ params: PARAMS }));
    await userEvent.click(screen.getByRole("button", { name: "Qué significa Cobrado" }));

    expect(screen.getByText(/reintegros y contracargos/)).toBeDefined();
  });

  it("the info of Por cliente activo includes the staff-booked classes and the shared active client text", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    const { container } = render(await PlataSection({ params: PARAMS }));
    await userEvent.click(screen.getByRole("button", { name: "Qué significa Por cliente activo" }));

    expect(screen.getByText(/clase suelta reservada por el staff/)).toBeDefined();
    expect(container.textContent).toContain(ACTIVE_CLIENT_INFO);
  });

  it("says sin datos para comparar when the comparison has no data", async () => {
    getMoneyStatsMock.mockResolvedValue({
      ...MONEY_STATS,
      meta: { ...MONEY_STATS.meta, comparison: { ...MONEY_STATS.meta.comparison!, hasData: false } },
      collected: { current: 120000, previous: null, change: null, changeUnit: "percent" },
      perDay: { current: 3871, previous: null, change: null, changeUnit: "percent" },
      perActiveClient: { current: 2400, previous: null, change: null, changeUnit: "percent" },
      byService: MONEY_STATS.byService.map((row) => ({ ...row, previousAmount: null, change: null })),
      series: MONEY_STATS.series.map((point) => ({ ...point, previousTotal: null })),
    });

    render(await PlataSection({ params: PARAMS }));

    expect(screen.getAllByText("sin datos para comparar")).toHaveLength(3);
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });

  it("splits by service first and by payment method on request, with shares and the change", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    render(await PlataSection({ params: PARAMS }));
    const card = screen.getByRole("heading", { name: "De dónde viene" }).closest("section")!;

    expect(within(card).getByRole("radio", { name: "Servicio" }).getAttribute("aria-checked")).toBe("true");
    const byService = within(card).getByRole("table", { name: "Cobrado por servicio" });
    expect(within(byService).getByText("Performance")).toBeDefined();
    expect(within(byService).getByText("$ 72.000,00")).toBeDefined();
    expect(within(byService).getByText("60%")).toBeDefined();
    expect(within(byService).getAllByText("▲ 20%").length).toBeGreaterThan(0);

    await userEvent.click(within(card).getByRole("radio", { name: "Medio de pago" }));

    const byMethod = within(card).getByRole("table", { name: "Cobrado por medio de pago" });
    expect(within(byMethod).getByText("Mercado Pago")).toBeDefined();
    expect(within(byMethod).getByText("Efectivo")).toBeDefined();
    expect(within(byMethod).getByText("Transferencia")).toBeDefined();
    expect(within(byMethod).getByText("75%")).toBeDefined();
  });

  it("splits only the service of the filter: the donut agrees with Cobrado", async () => {
    // With the filter on, the API's `collected` and every share are of that service; `byService` still lists all three.
    getMoneyStatsMock.mockResolvedValue({
      ...MONEY_STATS,
      collected: { current: 36000, previous: 30000, change: 20, changeUnit: "percent" },
      byService: [
        { service: "performance", amount: 72000, previousAmount: 60000, share: 2, change: 20 },
        { service: "rehab", amount: 36000, previousAmount: 30000, share: 1, change: 20 },
        { service: "recovery", amount: 12000, previousAmount: 10000, share: 1 / 3, change: 20 },
      ],
    });

    render(await PlataSection({ params: parseDashboardParams({ vista: "negocio", servicio: "rehab" }) }));

    const table = screen.getByRole("table", { name: "Cobrado por servicio" });
    expect(within(table).getByText("Rehab")).toBeDefined();
    expect(within(table).queryByText("Performance")).toBeNull();
    expect(within(table).queryByText("Recovery")).toBeNull();
    expect(within(table).getByText("100%")).toBeDefined();
  });

  it("shows the share and the change of each row as the API sent them, without computing them", async () => {
    // The amounts say 60% and ▲ 20%; the API says otherwise. Whatever it sends is what is shown, in the table and in the label.
    getMoneyStatsMock.mockResolvedValue({
      ...MONEY_STATS,
      byService: [
        { service: "performance", amount: 72000, previousAmount: 60000, share: 0.5, change: 7 },
        { service: "rehab", amount: 36000, previousAmount: 30000, share: 0.3, change: -3 },
        { service: "recovery", amount: 12000, previousAmount: 10000, share: 0.2, change: null },
      ],
    });

    render(await PlataSection({ params: PARAMS }));
    const table = screen.getByRole("table", { name: "Cobrado por servicio" });

    expect(within(table).getByText("50%")).toBeDefined();
    expect(within(table).getByText("20%")).toBeDefined();
    expect(within(table).getByText("▲ 7%")).toBeDefined();
    expect(within(table).getByText("▼ 3%")).toBeDefined();
    expect(within(table).queryByText("▲ 20%")).toBeNull();
    expect(
      await screen.findByRole("img", { name: "Cobrado por servicio: Performance 50%, Rehab 30%, Recovery 20%" }),
    ).toBeDefined();
  });

  it("names the whole range of a bucket in Ver datos, not only the day it starts", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    render(await PlataSection({ params: PARAMS }));

    const weekly = screen.getByRole("table", { name: "Cobrado por semana" });
    expect(within(weekly).getByText("1 oct – 4 oct")).toBeDefined();
    expect(within(weekly).getByText("19 oct – 31 oct")).toBeDefined();
  });

  it("says there were no charges instead of listing 0% for everyone", async () => {
    getMoneyStatsMock.mockResolvedValue({
      ...MONEY_STATS,
      byService: MONEY_STATS.byService.map((row) => ({ ...row, amount: 0, previousAmount: null, share: null, change: null })),
    });

    render(await PlataSection({ params: PARAMS }));

    expect(await screen.findByRole("img", { name: "Cobrado por servicio: sin cobros en el período" })).toBeDefined();
  });

  it("does not call an unchanged row an increase", async () => {
    getMoneyStatsMock.mockResolvedValue({
      ...MONEY_STATS,
      byService: [
        { service: "performance", amount: 72000, previousAmount: 72000, share: 0.67, change: 0 },
        { service: "rehab", amount: 36000, previousAmount: 0, share: 0.33, change: null },
      ],
    });

    render(await PlataSection({ params: PARAMS }));
    const table = screen.getByRole("table", { name: "Cobrado por servicio" });

    // Same amount: "= 0%", not "▲ 0%". A row with nothing before has no percentage to give.
    expect(within(table).getByText("= 0%")).toBeDefined();
    expect(within(table).queryByText("▲ 0%")).toBeNull();
    expect(within(table).getAllByText("—")).toHaveLength(1);
  });

  it("leaves the vs column out when not comparing", async () => {
    getMoneyStatsMock.mockResolvedValue({
      ...MONEY_STATS,
      meta: { ...MONEY_STATS.meta, comparison: null },
      byService: MONEY_STATS.byService.map((row) => ({ ...row, previousAmount: null, change: null })),
    });

    render(await PlataSection({ params: parseDashboardParams({ vista: "negocio", comparar: "no" }) }));

    const table = screen.getByRole("table", { name: "Cobrado por servicio" });
    expect(within(table).queryByRole("columnheader", { name: "vs" })).toBeNull();
  });

  it("renders Ver datos tables for both charts", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    render(await PlataSection({ params: PARAMS }));

    expect(screen.getAllByText("Ver datos")).toHaveLength(2);
    const weekly = screen.getByRole("table", { name: "Cobrado por semana" });
    expect(within(weekly).getAllByRole("row")).toHaveLength(5);
    expect(within(weekly).getByText("1 oct – 4 oct")).toBeDefined();
    expect(await screen.findByRole("img", { name: /Cobrado por servicio/ })).toBeDefined();
    expect(await screen.findByRole("img", { name: /Cobrado por semana/ })).toBeDefined();
  });

  it("says the conclusion in the label of the columns, with the numbers the API sent", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    render(await PlataSection({ params: PARAMS }));

    expect(
      await screen.findByRole("img", {
        name: "Cobrado por semana del 1 oct 2026 al 31 oct 2026: $ 120.000,00 en total, ▲ 20% vs período anterior. Los datos exactos están en Ver datos.",
      }),
    ).toBeDefined();
  });

  it("leaves the comparison out of the label of the columns when not comparing", async () => {
    getMoneyStatsMock.mockResolvedValue({ ...MONEY_STATS, meta: { ...MONEY_STATS.meta, comparison: null } });

    render(await PlataSection({ params: parseDashboardParams({ vista: "negocio", comparar: "no" }) }));

    expect(
      await screen.findByRole("img", {
        name: "Cobrado por semana del 1 oct 2026 al 31 oct 2026: $ 120.000,00 en total. Los datos exactos están en Ver datos.",
      }),
    ).toBeDefined();
  });

  it("offers the groupings the API allows as links that keep the filters", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    render(await PlataSection({ params: parseDashboardParams({ vista: "negocio", servicio: "rehab" }) }));
    const group = screen.getByRole("group", { name: "Agrupar por" });

    expect(within(group).getAllByRole("link").map((link) => link.textContent)).toEqual(["Día", "Semana", "Mes"]);
    expect(within(group).getByRole("link", { name: "Semana" }).getAttribute("aria-current")).toBe("page");
    expect(within(group).getByRole("link", { name: "Mes" }).getAttribute("href")).toBe(
      "/staff?vista=negocio&servicio=rehab&agrupar=mes",
    );
  });

  it("makes the grouping links 44 px tall on the phone", async () => {
    getMoneyStatsMock.mockResolvedValue(MONEY_STATS);

    render(await PlataSection({ params: PARAMS }));

    for (const link of within(screen.getByRole("group", { name: "Agrupar por" })).getAllByRole("link")) {
      expect(link.className).toContain("min-h-11");
      expect(link.className).toContain("sm:min-h-0");
    }
  });

  it("offers no grouping when there is only one", async () => {
    getMoneyStatsMock.mockResolvedValue({ ...MONEY_STATS, meta: { ...MONEY_STATS.meta, granularityOptions: ["week"] } });

    render(await PlataSection({ params: PARAMS }));

    expect(screen.queryByRole("group", { name: "Agrupar por" })).toBeNull();
  });

  it("shows an alert with Reintentar when money stats fail", async () => {
    getMoneyStatsMock.mockRejectedValue(new ApiError({ statusCode: 500, code: "INTERNAL", message: "x" }));
    const params = parseDashboardParams({ vista: "negocio", periodo: "este-mes", servicio: "rehab" });

    render(await PlataSection({ params }));

    expect(screen.getByRole("alert").textContent).toContain("No pudimos cargar la plata");
    expect(screen.getByRole("link", { name: "Reintentar" }).getAttribute("href")).toBe(
      "/staff?vista=negocio&periodo=este-mes&servicio=rehab",
    );
  });

  it("says the range is not valid, with a way back to the default period and no Reintentar, when the API refuses it", async () => {
    getMoneyStatsMock.mockRejectedValue(
      new ApiError({ statusCode: 400, code: "DASHBOARD_INVALID_RANGE", message: "x" }),
    );
    const params = parseDashboardParams({
      vista: "negocio",
      periodo: "fechas",
      desde: "2020-01-01",
      hasta: "2026-10-31",
      servicio: "rehab",
      agrupar: "dia",
    });

    render(await PlataSection({ params }));

    expect(screen.getByRole("alert").textContent).toContain("Ese rango de fechas no es válido.");
    expect(screen.queryByRole("link", { name: "Reintentar" })).toBeNull();
    expect(screen.queryByText(/problema temporario/)).toBeNull();
    // The default period; what the person had picked besides the range stays.
    expect(screen.getByRole("link", { name: "Ver el mes pasado" }).getAttribute("href")).toBe("/staff?vista=negocio&servicio=rehab");
  });

  it("a 409 DASHBOARD_UNSUPPORTED_CURRENCY says Hay montos en otra moneda; avisale al equipo técnico, with no Reintentar", async () => {
    getMoneyStatsMock.mockRejectedValue(new ApiError({ statusCode: 409, code: "DASHBOARD_UNSUPPORTED_CURRENCY", message: "x" }));

    render(await PlataSection({ params: PARAMS }));

    expect(screen.getByRole("alert").textContent).toContain("Hay montos en otra moneda; avisale al equipo técnico");
    expect(screen.queryByRole("link", { name: "Reintentar" })).toBeNull();
  });

  it("keeps Reintentar for a 400 that is not about the range", async () => {
    getMoneyStatsMock.mockRejectedValue(new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "x" }));

    render(await PlataSection({ params: PARAMS }));

    expect(screen.getByRole("link", { name: "Reintentar" })).toBeDefined();
  });

  it("lets a Next error such as a redirect through instead of swallowing it", async () => {
    const redirectError = nextRedirectError();
    getMoneyStatsMock.mockRejectedValue(redirectError);

    await expect(PlataSection({ params: PARAMS })).rejects.toBe(redirectError);
  });
});
