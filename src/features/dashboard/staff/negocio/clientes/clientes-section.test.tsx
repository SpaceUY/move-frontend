import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

import { parseDashboardParams } from "../../dashboard-params";
import { nextRedirectError } from "../../hoy/today-fixtures";
import { ACTIVE_CLIENT_INFO } from "../info-texts";
import { CLIENTS_STATS } from "./clients-fixtures";
import { ClientesSection, leavesNote } from "./clientes-section";
import { getClientsStats } from "./get-clients-stats";

vi.mock("./get-clients-stats");

vi.mock("recharts", () => import("../charts/fixed-size-recharts").then((module) => module.fixedSizeRecharts()));

const getClientsStatsMock = vi.mocked(getClientsStats);
const PARAMS = parseDashboardParams({ vista: "negocio", tab: "clientes" });

const metric = (current: number | null) => ({ current, previous: null, change: null, changeUnit: "percent" as const });

// What the card writes under the number, as text: the note is a node, so it is rendered to read it.
function noteText(joins: number | null, leaves: number | null, pending: number | null, staffLeaves: number): string {
  const { container } = render(
    <p>{leavesNote({ joins: metric(joins), leaves: { ...metric(leaves), pending }, staffLeaves: metric(staffLeaves) })}</p>,
  );
  return container.textContent ?? "";
}

beforeEach(() => {
  getClientsStatsMock.mockReset();
});

describe("ClientesSection", () => {
  it("asks the API with what the URL says", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);
    const params = parseDashboardParams({ vista: "negocio", tab: "clientes", periodo: "este-anio", servicio: "recovery" });

    render(await ClientesSection({ params }));

    expect(getClientsStatsMock).toHaveBeenCalledWith(params);
  });

  it("opens with the range and what counts as active, and the question", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    expect(screen.getByText("1 oct – 31 oct · Clientes con plan o reserva suelta ese día")).toBeDefined();
    expect(screen.getByRole("heading", { name: "¿Crecemos o perdemos gente, y por qué?" })).toBeDefined();
  });

  it("does not render the period menus, the comparison note or the grouping links", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    expect(screen.queryByText(/período anterior/i)).toBeNull();
    expect(screen.queryByText(/comparado con/)).toBeNull();
    expect(screen.queryByRole("group", { name: "Agrupar por" })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("names the service in the question when the filter is on", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: parseDashboardParams({ vista: "negocio", tab: "clientes", servicio: "recovery" }) }));

    expect(screen.getByRole("heading", { name: "¿Crecemos o perdemos gente, y por qué? · Recovery" })).toBeDefined();
  });

  it('labels the first tile "Clientes activos hoy" and shows the delta next to the leaves note', async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    const active = screen.getByRole("heading", { name: "Clientes activos hoy" }).closest("article")!;
    expect(within(active).getByText("84")).toBeDefined();
    expect(within(active).getByText("+9 altas").className).toContain("text-success");
    expect(within(active).getByText("−4 bajas").className).toContain("text-danger");
    // 84 against 79 the day before the range starts: the plain difference, not a percentage.
    expect(within(active).getByText("▲ 5").className).toContain("text-success");
    expect(within(active).getByText("vs hace 6 meses")).toBeDefined();
    expect(within(active).queryByText(/%/)).toBeNull();
  });

  it("the delta follows the range of the URL", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: parseDashboardParams({ vista: "negocio", tab: "clientes", rango: "30-dias" }) }));

    expect(screen.getByText("vs hace 30 días")).toBeDefined();
  });

  it("renewal line shows pending when some plans are still in grace", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    const renewal = screen.getByRole("heading", { name: "Renovación" }).closest("article")!;
    expect(within(renewal).getByText("68%")).toBeDefined();
    expect(within(renewal).getByText("17 de 25 · 4 en curso")).toBeDefined();
    expect(within(renewal).queryByText(/pts/)).toBeNull();
  });

  it("renewal line leaves en curso out when nothing is pending", async () => {
    getClientsStatsMock.mockResolvedValue({ ...CLIENTS_STATS, renewal: { ...CLIENTS_STATS.renewal, pending: 0 } });

    render(await ClientesSection({ params: PARAMS }));

    const renewal = screen.getByRole("heading", { name: "Renovación" }).closest("article")!;
    expect(within(renewal).getByText("17 de 25")).toBeDefined();
    expect(within(renewal).queryByText(/en curso/)).toBeNull();
  });

  it("renewal shows a dash, not 0%, when no plan was due yet", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      renewal: { current: null, previous: 0.65, change: null, changeUnit: "points", renewed: 0, due: 0, pending: 6 },
    });

    render(await ClientesSection({ params: PARAMS }));

    const renewal = screen.getByRole("heading", { name: "Renovación" }).closest("article")!;
    expect(within(renewal).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(renewal).getByText("0 de 0 · 6 en curso")).toBeDefined();
    expect(within(renewal).queryByText(/NaN|0%/)).toBeNull();
  });

  it("paused shows the count of today with no comparison", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      paused: { current: 12, previous: 16, change: -25, changeUnit: "percent" },
    });

    render(await ClientesSection({ params: PARAMS }));

    const paused = screen.getByRole("heading", { name: "En pausa" }).closest("article")!;
    expect(within(paused).getByText("12")).toBeDefined();
    expect(within(paused).getByText("no son bajas")).toBeDefined();
    expect(within(paused).queryByText(/%|▼|▲/)).toBeNull();
  });

  it("keeps the tile without delta when the API has no comparison data", async () => {
    const nothing = { previous: null, change: null } as const;
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      meta: { ...CLIENTS_STATS.meta, comparison: { ...CLIENTS_STATS.meta.comparison!, hasData: false } },
      active: { ...CLIENTS_STATS.active, ...nothing },
      renewal: { ...CLIENTS_STATS.renewal, ...nothing },
      paused: { ...CLIENTS_STATS.paused, ...nothing },
      series: CLIENTS_STATS.series.map((point) => ({ ...point, previousActive: null })),
    });

    render(await ClientesSection({ params: PARAMS }));

    const active = screen.getByRole("heading", { name: "Clientes activos hoy" }).closest("article")!;
    expect(within(active).getByText("84")).toBeDefined();
    expect(within(active).queryByText(/vs hace/)).toBeNull();
    expect(screen.queryByText("sin datos para comparar")).toBeNull();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });

  it("Rehab: renewal is a dash and nothing breaks when the API sends no comparison", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      meta: { ...CLIENTS_STATS.meta, comparison: null },
      renewal: { current: null, previous: null, change: null, changeUnit: "points", renewed: 0, due: 0, pending: 0 },
      renewalByService: [],
    });

    render(await ClientesSection({ params: parseDashboardParams({ vista: "negocio", tab: "clientes", servicio: "rehab" }) }));

    const renewal = screen.getByRole("heading", { name: "Renovación" }).closest("article")!;
    expect(within(renewal).getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });

  it("draws active, joins and leaves with the grouping the API chose, and its data table", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    const card = screen.getByRole("heading", { name: "Activos, altas y bajas por semana" }).closest("section")!;
    expect(
      await within(card).findByRole("img", {
        name: "Clientes activos por semana del 1 oct 2026 al 31 oct 2026: 84 al final, ▲ 5 vs hace 6 meses. Los datos exactos están en Ver datos.",
      }),
    ).toBeDefined();
    const data = within(card).getByRole("table", { name: "Activos, altas y bajas por semana" });
    expect(within(data).getByText("1 oct – 4 oct")).toBeDefined();
    expect(within(data).getAllByRole("row")).toHaveLength(5);
  });

  it("the chart gets no previous line and the data table has no previous column", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    const card = screen.getByRole("heading", { name: "Activos, altas y bajas por semana" }).closest("section")!;
    expect(within(card).queryByRole("link")).toBeNull();
    const legend = within(card).getByRole("list", { name: "Referencias del gráfico" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Activos", "Altas", "Bajas", "Bajas en curso"]);
    const table = within(card).getByRole("table", { name: "Activos, altas y bajas por semana" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Semana",
      "Activos",
      "Altas",
      "Bajas",
      "Bajas en curso",
    ]);
  });

  it("the data table of the clients chart has a Bajas en curso column with the API values", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    const table = screen.getByRole("table", { name: /Activos, altas y bajas por semana/ });
    const headers = within(table).getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(expect.arrayContaining(["Bajas", "Bajas en curso"]));
    const column = headers.indexOf("Bajas en curso");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[column]?.textContent)).toEqual(["0", "0", "2", "3"]);
  });

  it("marks the bucket in progress in the data table", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      series: CLIENTS_STATS.series.map((point, index) => ({ ...point, inProgress: index === 3 })),
    });

    render(await ClientesSection({ params: PARAMS }));

    const data = screen.getByRole("table", { name: "Activos, altas y bajas por semana" });
    expect(within(data).getByText("19 oct – 31 oct (en curso)")).toBeDefined();
  });

  it("renewal by service writes the percentage the API sent, with renewed of due under it", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    const card = screen.getByRole("heading", { name: "Renovación por servicio" }).closest("section")!;
    const performance = within(card).getByText("Performance").closest("li")!;
    expect(within(performance).getByText("79%")).toBeDefined();
    expect(within(performance).getByText("11 de 14")).toBeDefined();
    const recovery = within(card).getByText("Recovery").closest("li")!;
    expect(within(recovery).getByText("55%")).toBeDefined();
    expect(within(recovery).getByText("6 de 11")).toBeDefined();
  });

  it("renewal by service draws each bar from the rate, not from renewed and due", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      renewalByService: [{ service: "performance", renewed: 11, due: 14, rate: 0.5 }],
    });

    render(await ClientesSection({ params: PARAMS }));

    const row = screen.getByText("Performance").closest("li")!;
    expect((row.querySelector("[data-fill]") as HTMLElement).style.width).toBe("50%");
  });

  it("renewal by service shows a dash and an empty bar, not 0%, when nothing was due", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      renewalByService: [
        { service: "performance", renewed: 11, due: 14, rate: 0.79 },
        { service: "recovery", renewed: 0, due: 0, rate: null },
      ],
    });

    render(await ClientesSection({ params: PARAMS }));

    const row = screen.getByText("Recovery").closest("li")!;
    expect(within(row).getByText("—")).toBeDefined();
    expect(within(row).getByText("0 de 0")).toBeDefined();
    expect((row.querySelector("[data-fill]") as HTMLElement).style.width).toBe("0%");
    expect(row.textContent).not.toMatch(/NaN|Infinity|0%/);
  });

  it("when every service has due 0 it says Ningún plan venció en el período", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      renewalByService: [
        { service: "performance", renewed: 0, due: 0, rate: null },
        { service: "recovery", renewed: 0, due: 0, rate: null },
      ],
    });

    render(await ClientesSection({ params: PARAMS }));

    const card = screen.getByRole("heading", { name: "Renovación por servicio" }).closest("section")!;
    expect(within(card).getByText("Ningún plan venció en el período.")).toBeDefined();
    expect(within(card).queryByText("0 de 0")).toBeNull();
  });

  it("renewal by service never lists Rehab", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      // Whatever the API sends: Rehab has no plans, so it cannot have a renewal.
      renewalByService: [
        ...CLIENTS_STATS.renewalByService,
        { service: "rehab", renewed: 1, due: 2, rate: 0.5 } as never,
      ],
    });

    render(await ClientesSection({ params: PARAMS }));

    const card = screen.getByRole("heading", { name: "Renovación por servicio" }).closest("section")!;
    expect(within(card).queryByText("Rehab")).toBeNull();
  });

  it("renewal by service says Rehab has no plans when the filter is Rehab", async () => {
    getClientsStatsMock.mockResolvedValue({ ...CLIENTS_STATS, renewalByService: [] });

    render(await ClientesSection({ params: parseDashboardParams({ vista: "negocio", tab: "clientes", servicio: "rehab" }) }));

    const card = screen.getByRole("heading", { name: "Renovación por servicio" }).closest("section")!;
    expect(within(card).getByText("Rehab no tiene planes, así que no tiene renovación.")).toBeDefined();
  });

  it("with Rehab it still says Rehab no tiene planes, even if the rows had a due of 0", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      renewalByService: [{ service: "performance", renewed: 0, due: 0, rate: null }],
    });

    render(await ClientesSection({ params: parseDashboardParams({ vista: "negocio", tab: "clientes", servicio: "rehab" }) }));

    const card = screen.getByRole("heading", { name: "Renovación por servicio" }).closest("section")!;
    expect(within(card).getByText("Rehab no tiene planes, así que no tiene renovación.")).toBeDefined();
    expect(within(card).queryByText("Ningún plan venció en el período.")).toBeNull();
  });

  it("renewal by service keeps only the service of the filter", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: parseDashboardParams({ vista: "negocio", tab: "clientes", servicio: "recovery" }) }));

    const card = screen.getByRole("heading", { name: "Renovación por servicio" }).closest("section")!;
    expect(within(card).queryByText("Performance")).toBeNull();
    expect(within(card).getByText("Recovery")).toBeDefined();
  });

  it("why they pause uses the follow-up reason labels", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    const card = screen.getByRole("heading", { name: "Por qué pausan" }).closest("section")!;
    expect(within(card).getByText("Lesión").closest("li")!.textContent).toContain("5");
    expect(within(card).getByText("Vacaciones")).toBeDefined();
    expect(within(card).getByText("Falta de tiempo")).toBeDefined();
    expect(within(card).getByText("Mudanza")).toBeDefined();
  });

  it("why they pause says Otro motivo, not the raw code, for a reason it does not know", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      // `constructor` is a key every object inherits: it must not pick up a function as its label.
      pauseReasons: [
        { reason: "something_new", count: 2 },
        { reason: "constructor", count: 1 },
      ],
    });

    render(await ClientesSection({ params: PARAMS }));

    const card = screen.getByRole("heading", { name: "Por qué pausan" }).closest("section")!;
    expect(within(card).getAllByText("Otro motivo")).toHaveLength(2);
    expect(within(card).queryByText(/something_new|constructor|function/)).toBeNull();
  });

  it("why they pause says nobody is paused instead of drawing an empty list", async () => {
    getClientsStatsMock.mockResolvedValue({ ...CLIENTS_STATS, pauseReasons: [] });

    render(await ClientesSection({ params: PARAMS }));

    const card = screen.getByRole("heading", { name: "Por qué pausan" }).closest("section")!;
    expect(within(card).getByText("Nadie está en pausa.")).toBeDefined();
  });

  it("the i of Activos explains who counts, and the i of Renovación says Rehab has no plans", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));
    await userEvent.click(screen.getByRole("button", { name: "Qué significa Clientes activos hoy" }));
    await userEvent.click(screen.getByRole("button", { name: "Qué significa Renovación" }));

    expect(screen.getByText(/los desactivados y los packs agotados no/)).toBeDefined();
    expect(screen.getByText(/Rehab no tiene planes/)).toBeDefined();
  });

  it("the i of Activos counts a loose class the staff booked, paid or not", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));
    await userEvent.click(screen.getByRole("button", { name: "Qué significa Clientes activos hoy" }));

    expect(screen.getByText(/una clase suelta reservada por el staff \(confirmada\)/)).toBeDefined();
    expect(screen.queryByText(/cobrada/)).toBeNull();
  });

  it("the i of Renovación sends the grace days to Configuración without fixing a number that is a setting", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));
    await userEvent.click(screen.getByRole("button", { name: "Qué significa Renovación" }));

    expect(screen.getByText(/dentro de los días de gracia que están en Configuración/)).toBeDefined();
    expect(screen.queryByText(/\(30/)).toBeNull();
  });

  it("with Rehab the bajas are a dash with no sign, because Rehab has no plans to end", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      leaves: { current: null, previous: null, change: null, changeUnit: "percent", pending: null },
    });

    render(await ClientesSection({ params: parseDashboardParams({ vista: "negocio", tab: "clientes", servicio: "rehab" }) }));

    const active = screen.getByRole("heading", { name: "Clientes activos hoy" }).closest("article")!;
    expect(within(active).getByText("— bajas")).toBeDefined();
    expect(within(active).getByText("+9 altas")).toBeDefined();
    expect(within(active).queryByText(/−—/)).toBeNull();
  });

  it("writes en curso when leaves.pending is above 0", () => {
    expect(noteText(9, 3, 5, 0)).toBe("+9 altas / −3 bajas · 5 en curso");
  });

  it("writes nothing for en curso when it is 0 or null", () => {
    expect(noteText(9, 3, 0, 0)).toBe("+9 altas / −3 bajas");
    expect(noteText(9, 3, null, 0)).toBe("+9 altas / −3 bajas");
  });

  it("writes 1 dada de baja por el staff in singular and 3 dadas in plural", () => {
    expect(noteText(9, 3, 5, 1)).toBe("+9 altas / −3 bajas · 5 en curso · 1 dada de baja por el staff");
    expect(noteText(9, 3, 0, 3)).toBe("+9 altas / −3 bajas · 3 dadas de baja por el staff");
  });

  it('with Rehab it reads "— bajas" and still shows the staff leaves', () => {
    const text = noteText(2, null, null, 1);

    expect(text).toBe("+2 altas / — bajas · 1 dada de baja por el staff");
    expect(text).not.toContain("−—");
  });

  it("the card shows en curso and the staff leaves from the API", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    const active = screen.getByRole("heading", { name: "Clientes activos hoy" }).closest("article")!;
    expect(within(active).getByText(/5 en curso/)).toBeDefined();
    expect(within(active).getByText(/1 dada de baja por el staff/)).toBeDefined();
  });

  it("the i of Activos explains bajas, en curso and the ones the staff deactivated", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));
    await userEvent.click(screen.getByRole("button", { name: "Qué significa Clientes activos hoy" }));

    expect(screen.getByText(/Bajas: clientes cuyo plan venció en el período y ya pasaron los días de gracia sin renovar/)).toBeDefined();
    expect(screen.getByText(/Dadas de baja por el staff: cuentas que el staff desactivó en el período; no se cuentan también como bajas/)).toBeDefined();
  });

  it("the info of Clientes activos starts with the active client text shared with Plata", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    const { container } = render(await ClientesSection({ params: PARAMS }));
    await userEvent.click(screen.getByRole("button", { name: "Qué significa Clientes activos hoy" }));

    expect(container.textContent).toContain(ACTIVE_CLIENT_INFO);
  });

  it("the info of Renovación talks about plans", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));
    await userEvent.click(screen.getByRole("button", { name: "Qué significa Renovación" }));

    expect(screen.getByText(/cuántos planes se renovaron/)).toBeDefined();
    expect(screen.queryByText(/cuántos clientes compraron otro/)).toBeNull();
  });

  it("joins with nothing to count are a dash with no sign either", async () => {
    getClientsStatsMock.mockResolvedValue({
      ...CLIENTS_STATS,
      joins: { current: null, previous: null, change: null, changeUnit: "percent" },
    });

    render(await ClientesSection({ params: PARAMS }));

    const active = screen.getByRole("heading", { name: "Clientes activos hoy" }).closest("article")!;
    expect(within(active).getByText("— altas")).toBeDefined();
    expect(within(active).getByText("−4 bajas")).toBeDefined();
  });

  it("keeps its cards inside the phone width: one shrinkable column", async () => {
    getClientsStatsMock.mockResolvedValue(CLIENTS_STATS);

    render(await ClientesSection({ params: PARAMS }));

    const cards = screen.getByRole("heading", { name: "Activos, altas y bajas por semana" }).closest("section")!.parentElement!;
    expect(cards.className).toContain("min-w-0");
    expect(cards.parentElement!.className).toContain("grid-cols-1");
  });

  it("shows an alert with Reintentar when the stats fail, and the range error without it", async () => {
    getClientsStatsMock.mockRejectedValue(new ApiError({ statusCode: 500, code: "INTERNAL", message: "x" }));

    const { unmount } = render(await ClientesSection({ params: PARAMS }));
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("No pudimos cargar los clientes")).toBeDefined();
    expect(within(alert).getByRole("link", { name: "Reintentar" }).getAttribute("href")).toBe("/staff?vista=negocio&tab=clientes");
    unmount();

    getClientsStatsMock.mockRejectedValue(new ApiError({ statusCode: 400, code: "DASHBOARD_INVALID_RANGE", message: "x" }));
    render(await ClientesSection({ params: PARAMS }));
    expect(screen.queryByRole("link", { name: "Reintentar" })).toBeNull();
    expect(screen.getByText("Ese rango de fechas no es válido.")).toBeDefined();
  });

  it("rethrows Next control-flow errors instead of showing the alert", async () => {
    getClientsStatsMock.mockRejectedValue(nextRedirectError());

    await expect(ClientesSection({ params: PARAMS })).rejects.toBeDefined();
  });
});
