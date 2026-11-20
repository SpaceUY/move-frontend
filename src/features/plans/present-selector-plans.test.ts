import { describe, expect, it } from "vitest";

import type { PlanDto } from "@/lib/api/types";

import { presentSelectorPlans } from "./present-selector-plans";

const plan = (overrides: Partial<PlanDto>): PlanDto => ({
  id: "id",
  service: "performance",
  kind: "period_plan",
  slug: "slug",
  name: "Mensual",
  description: "",
  features: ["Asistencias ilimitadas con reserva", "Historial de entrenamiento"],
  price: 3900,
  periodMonths: 1,
  periodDays: null,
  sessionsIncluded: null,
  durationMinutes: null,
  featured: false,
  autoDebitEnabled: false,
  ...overrides,
});

const performancePlans = [
  plan({ id: "mensual", name: "Mensual" }),
  plan({
    id: "trimestral",
    name: "Trimestral",
    price: 10500,
    featured: true,
    features: ["Asistencias ilimitadas con reserva", "Ahorrás un 10% vs. mensual"],
  }),
  plan({
    id: "semestral",
    name: "Semestral",
    price: 19800,
    features: ["Asistencias ilimitadas con reserva", "Ahorrás un 15% vs. mensual"],
  }),
];

describe("presentSelectorPlans", () => {
  it("lists the features of every plan, exactly as staff wrote them", () => {
    const [mensual, trimestral, semestral] = presentSelectorPlans(performancePlans);

    expect(mensual).toMatchObject({
      id: "mensual",
      name: "Plan Mensual",
      price: "$ 3.900",
      features: ["Asistencias ilimitadas con reserva", "Historial de entrenamiento"],
    });
    expect(trimestral.features).toEqual(["Asistencias ilimitadas con reserva", "Ahorrás un 10% vs. mensual"]);
    expect(semestral.features).toEqual(["Asistencias ilimitadas con reserva", "Ahorrás un 15% vs. mensual"]);
  });

  it("does not invent 'Todo lo de…' text for the plans after the first", () => {
    const options = presentSelectorPlans(performancePlans);

    expect(options.every((option) => !("includes" in option))).toBe(true);
  });

  it("carries the featured flag and the action of each plan kind", () => {
    const [mensual, trimestral] = presentSelectorPlans(performancePlans);

    expect(mensual.featured).toBe(false);
    expect(trimestral.featured).toBe(true);
    expect(trimestral.actionLabel).toBe("Contratar");
    expect(trimestral.actionHref).toBe("/checkout/plan/trimestral");
  });

  it("returns nothing when there are no plans", () => {
    expect(presentSelectorPlans([])).toEqual([]);
  });
});
