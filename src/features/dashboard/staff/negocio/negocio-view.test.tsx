import { isValidElement, Suspense, type ReactElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseDashboardParams } from "../dashboard-params";
import { ClientsRangeControls } from "./clientes/clients-range-controls";
import { NegocioTabs } from "./negocio-tabs";
import { PeriodControls } from "./period-controls";
import { ServiceFilter } from "./service-filter";
import { NegocioView } from "./negocio-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

// The tab sections read the API: each one has its own test.
vi.mock("./plata/plata-section", () => ({ PlataSection: () => <p>Sección Plata</p> }));
vi.mock("./turnos/turnos-section", () => ({ TurnosSection: () => <p>Sección Turnos</p> }));
vi.mock("./clientes/clientes-section", () => ({ ClientesSection: () => <p>Sección Clientes</p> }));

function containsType(node: ReactNode, type: unknown): boolean {
  if (!isValidElement<{ children?: ReactNode }>(node)) return false;
  if (node.type === type) return true;
  const children = node.props.children;
  return (Array.isArray(children) ? children : [children]).some((child) => containsType(child, type));
}

function findSuspense(node: ReactNode): ReactElement | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (node.type === Suspense) return node;
  const children = node.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findSuspense(child);
    if (found) return found;
  }
  return null;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("NegocioView", () => {
  it("renders the tabs, the period controls and the service filter", () => {
    render(<NegocioView params={parseDashboardParams({ vista: "negocio" })} />);

    expect(screen.getByRole("navigation", { name: "Secciones de Negocio" })).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Período" })).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Comparar con" })).toBeDefined();
    expect(screen.getByRole("group", { name: "Servicio" })).toBeDefined();
  });

  it("brings the skeleton back when a filter changes: the Suspense is keyed on the href", () => {
    const first = findSuspense(NegocioView({ params: parseDashboardParams({ vista: "negocio" }) }));
    const second = findSuspense(NegocioView({ params: parseDashboardParams({ vista: "negocio", servicio: "rehab" }) }));

    expect(first?.key).toBe("/staff?vista=negocio");
    expect(second?.key).toBe("/staff?vista=negocio&servicio=rehab");
  });

  it("keeps the controls out of the Suspense, so a failing or loading tab never takes them away", () => {
    const tree = NegocioView({ params: parseDashboardParams({ vista: "negocio" }) });
    const suspense = findSuspense(tree);

    for (const control of [NegocioTabs, PeriodControls, ServiceFilter]) {
      expect(containsType(tree, control)).toBe(true);
      expect(containsType(suspense, control)).toBe(false);
    }
  });

  it("shows the Plata section when the tab is plata", () => {
    render(<NegocioView params={parseDashboardParams({ vista: "negocio" })} />);

    expect(screen.getByText("Sección Plata")).toBeDefined();
  });

  it("shows the Turnos section when the tab is turnos, and only that one", () => {
    render(<NegocioView params={parseDashboardParams({ vista: "negocio", tab: "turnos" })} />);

    expect(screen.getByText("Sección Turnos")).toBeDefined();
    expect(screen.queryByText("Sección Plata")).toBeNull();
  });

  it("shows the range buttons and no period menus on Clientes", () => {
    const tree = NegocioView({ params: parseDashboardParams({ vista: "negocio", tab: "clientes" }) });

    expect(containsType(tree, ClientsRangeControls)).toBe(true);
    expect(containsType(tree, PeriodControls)).toBe(false);
    expect(containsType(tree, ServiceFilter)).toBe(true);
  });

  it("keeps PeriodControls on Plata and Turnos", () => {
    for (const tab of ["plata", "turnos"]) {
      const tree = NegocioView({ params: parseDashboardParams({ vista: "negocio", tab }) });

      expect(containsType(tree, PeriodControls)).toBe(true);
      expect(containsType(tree, ClientsRangeControls)).toBe(false);
      expect(containsType(tree, ServiceFilter)).toBe(true);
    }
  });

  it("shows the Clientes section when the tab is clientes, and only that one", () => {
    render(<NegocioView params={parseDashboardParams({ vista: "negocio", tab: "clientes" })} />);

    expect(screen.getByText("Sección Clientes")).toBeDefined();
    expect(screen.queryByText("Sección Turnos")).toBeNull();
  });

  it("ends the date pickers on today in Montevideo, even when it is already tomorrow in UTC", () => {
    // 23:30 of Nov 3 in Montevideo (UTC-3) is 02:30 of Nov 4 in UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T02:30:00Z"));

    render(
      <NegocioView
        params={parseDashboardParams({ vista: "negocio", periodo: "fechas", desde: "2026-10-05", hasta: "2026-10-19" })}
      />,
    );

    expect((screen.getByLabelText("Desde") as HTMLInputElement).max).toBe("2026-11-03");
    expect((screen.getByLabelText("Hasta") as HTMLInputElement).max).toBe("2026-11-03");
  });
});
