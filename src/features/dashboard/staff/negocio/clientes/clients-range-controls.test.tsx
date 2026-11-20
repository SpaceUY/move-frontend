import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseDashboardParams } from "../../dashboard-params";
import { ClientsRangeControls } from "./clients-range-controls";

const clientes = { vista: "negocio", tab: "clientes" };

describe("ClientsRangeControls", () => {
  it("marks the current range with aria-current", () => {
    render(<ClientsRangeControls params={parseDashboardParams({ ...clientes, rango: "3-meses" })} />);

    expect(screen.getByRole("group", { name: "Rango" })).toBeDefined();
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["30 días", "3 meses", "6 meses", "Todo"]);
    expect(screen.getByRole("link", { name: "3 meses" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Todo" }).getAttribute("aria-current")).toBeNull();
  });

  it("links keep the service and change only the range", () => {
    render(<ClientsRangeControls params={parseDashboardParams({ ...clientes, servicio: "rehab" })} />);

    const href = screen.getByRole("link", { name: "30 días" }).getAttribute("href") ?? "";
    expect(href).toContain("servicio=rehab");
    expect(href).toContain("rango=30-dias");
    expect(href).toContain("tab=clientes");
  });

  it("the default range link has no rango in its href", () => {
    render(<ClientsRangeControls params={parseDashboardParams({ ...clientes, rango: "todo" })} />);

    expect(screen.getByRole("link", { name: "6 meses" }).getAttribute("href")).not.toContain("rango");
  });
});
