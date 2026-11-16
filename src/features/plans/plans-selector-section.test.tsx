import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanDto, ServiceType } from "@/lib/api/types";

vi.mock("./get-plans", () => ({ getPlans: vi.fn() }));

import { getPlans } from "./get-plans";
import { PlansSelectorList } from "./plans-selector-section";

const getPlansMock = vi.mocked(getPlans);

const plan = (overrides: Partial<PlanDto>): PlanDto => ({
  id: "id",
  service: "performance",
  kind: "period_plan",
  slug: "slug",
  name: "Mensual",
  description: "",
  features: ["Reserva y cancelación online"],
  price: 3900,
  periodMonths: 1,
  periodDays: null,
  sessionsIncluded: null,
  durationMinutes: null,
  featured: false,
  autoDebitEnabled: false,
  ...overrides,
});

const catalog: Record<ServiceType, PlanDto[]> = {
  performance: [
    plan({ id: "mensual", name: "Mensual" }),
    plan({ id: "trimestral", name: "Trimestral", price: 10500, featured: true }),
  ],
  recovery: [
    plan({
      id: "individual",
      service: "recovery",
      kind: "single_session",
      name: "Sesión individual",
      price: 900,
    }),
    plan({
      id: "pack-4",
      service: "recovery",
      kind: "session_pack",
      name: "Paquete 4 sesiones",
      price: 3200,
      featured: true,
    }),
  ],
  rehab: [],
};

describe("PlansSelectorList", () => {
  beforeEach(() => {
    getPlansMock.mockReset();
    getPlansMock.mockImplementation(async (service) => catalog[service ?? "performance"]);
  });

  it("shows a card for Performance and another for Recovery, each with its own plans", async () => {
    render(await PlansSelectorList({}));

    expect(getPlansMock).toHaveBeenCalledWith("performance");
    expect(getPlansMock).toHaveBeenCalledWith("recovery");
    expect(screen.getByRole("heading", { level: 3, name: "Entrená." })).toBeDefined();
    expect(screen.getByRole("heading", { level: 3, name: "Recuperate." })).toBeDefined();
    const performance = screen.getByRole("radiogroup", { name: "Planes de Performance" });
    expect(performance.textContent).toContain("Plan Trimestral");
    const recovery = screen.getByRole("radiogroup", { name: "Planes de Recovery" });
    expect(recovery.textContent).toContain("Paquete 4 sesiones");
  });

  it("starts each card on its featured plan", async () => {
    render(await PlansSelectorList({}));

    expect(screen.getByRole("link", { name: "Contratar · $ 10.500" }).getAttribute("href")).toBe(
      "/checkout/plan/trimestral",
    );
    expect(
      screen.getByRole("link", { name: "Contratar paquete · $ 3.200" }).getAttribute("href"),
    ).toBe("/checkout/plan/pack-4");
  });

  it("still shows Recovery when the Performance plans cannot be loaded", async () => {
    getPlansMock.mockImplementation(async (service) => {
      if (service === "performance") throw new TypeError("fetch failed");
      return catalog[service ?? "recovery"];
    });

    render(await PlansSelectorList({}));

    expect(screen.getByText(/No pudimos cargar los planes de Performance/)).toBeDefined();
    expect(screen.getByRole("radiogroup", { name: "Planes de Recovery" })).toBeDefined();
  });

  it("shows two columns when both services have plans", async () => {
    const { container } = render(await PlansSelectorList({}));

    expect(container.firstElementChild?.className).toContain("md:grid-cols-2");
  });

  it("hides the card of a service with no published plans and centers the other", async () => {
    getPlansMock.mockImplementation(async (service) =>
      service === "recovery" ? [] : catalog.performance,
    );

    const { container } = render(await PlansSelectorList({}));

    expect(screen.queryByText(/Todavía no hay planes/)).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Planes de Recovery" })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Planes de Performance" })).toBeDefined();
    expect(container.firstElementChild?.className).not.toContain("md:grid-cols-2");
    expect(container.firstElementChild?.className).toContain("mx-auto");
  });

  it("keeps the load error of a failed service even when the other has no plans", async () => {
    getPlansMock.mockImplementation(async (service) => {
      if (service === "performance") throw new TypeError("fetch failed");
      return [];
    });

    render(await PlansSelectorList({}));

    expect(screen.getByText(/No pudimos cargar los planes de Performance/)).toBeDefined();
  });

  it("says so once when no service has published plans", async () => {
    getPlansMock.mockResolvedValue([]);

    render(await PlansSelectorList({}));

    expect(screen.getAllByText("Todavía no hay planes publicados.")).toHaveLength(1);
  });
});
