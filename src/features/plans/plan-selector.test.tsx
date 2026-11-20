import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlanSelector } from "./plan-selector";
import type { SelectorOption } from "./present-selector-plans";

const option = ({ id = "id", ...overrides }: Partial<SelectorOption>): SelectorOption => ({
  id,
  name: "Plan Mensual",
  price: "$ 3.900",
  features: [],
  featured: false,
  actionLabel: "Contratar",
  actionHref: `/checkout/plan/${id}`,
  ...overrides,
});

const options: SelectorOption[] = [
  option({
    id: "mensual",
    features: ["Reserva y cancelación online", "Historial de entrenamiento"],
  }),
  option({
    id: "trimestral",
    name: "Plan Trimestral",
    price: "$ 10.500",
    features: ["Asistencias ilimitadas", "Ahorrás un 10%"],
    featured: true,
  }),
  option({
    id: "semestral",
    name: "Plan Semestral",
    price: "$ 19.800",
    features: ["Asistencias ilimitadas", "Ahorrás un 15%"],
  }),
];

const renderSelector = (planOptions: SelectorOption[] = options) =>
  render(
    <PlanSelector
      id="performance"
      label="Performance"
      caption="Por período"
      title="Entrená."
      description="Entrenamiento semi personalizado."
      options={planOptions}
    />,
  );

describe("PlanSelector", () => {
  it("introduces the service", () => {
    renderSelector();

    expect(screen.getByText("Performance")).toBeDefined();
    expect(screen.getByText("Por período")).toBeDefined();
    expect(screen.getByRole("heading", { level: 3, name: "Entrená." })).toBeDefined();
    expect(screen.getByText("Entrenamiento semi personalizado.")).toBeDefined();
  });

  it("lists the features of every plan, not only the first", () => {
    renderSelector();

    expect(screen.getByText("Reserva y cancelación online")).toBeDefined();
    expect(screen.getByText("Historial de entrenamiento")).toBeDefined();
    expect(screen.getByText("Ahorrás un 10%")).toBeDefined();
    expect(screen.getByText("Ahorrás un 15%")).toBeDefined();
  });

  it("starts on the featured plan and links its checkout", () => {
    renderSelector();

    expect(screen.getByRole("radio", { name: /Plan Trimestral/ })).toHaveProperty("checked", true);
    const cta = screen.getByRole("link", { name: "Contratar · $ 10.500" });
    expect(cta.getAttribute("href")).toBe("/checkout/plan/trimestral");
  });

  it("starts on the first plan when none is featured", () => {
    renderSelector([
      option({ id: "mensual" }),
      option({ id: "trimestral", name: "Plan Trimestral", price: "$ 10.500" }),
    ]);

    expect(screen.getByRole("radio", { name: /Plan Mensual/ })).toHaveProperty("checked", true);
    expect(screen.getByRole("link", { name: "Contratar · $ 3.900" })).toBeDefined();
  });

  it("points the button at the plan the client picks", () => {
    renderSelector();

    fireEvent.click(screen.getByRole("radio", { name: /Plan Semestral/ }));

    const cta = screen.getByRole("link", { name: "Contratar · $ 19.800" });
    expect(cta.getAttribute("href")).toBe("/checkout/plan/semestral");
    expect(screen.queryByRole("link", { name: "Contratar · $ 10.500" })).toBeNull();
  });

  it("keeps the Coming Soon button for a plan without a destination yet", () => {
    renderSelector([option({ id: "raro", actionHref: null })]);

    expect(screen.getByRole("button", { name: "Contratar · $ 3.900" })).toBeDefined();
    expect(screen.getByText("Próximamente")).toBeDefined();
  });
});
