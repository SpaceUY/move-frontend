import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClientsFilters } from "./clients-filters";

vi.mock("./clients-search-field", () => ({
  ClientsSearchField: ({ params }: { params: { q: string } }) => <div>search for «{params.q}»</div>,
}));

const group = () => screen.getByRole("group", { name: "Filtrar clientes" });
const chip = (name: string) => screen.getByRole("link", { name });

describe("ClientsFilters", () => {
  it("marks Activos as the current filter by default and links to the other one", () => {
    render(<ClientsFilters params={{ q: "", page: 1, status: "active", expiringSoon: false, everyone: false }} />);

    expect(group()).toBeDefined();
    expect(chip("Activos").getAttribute("aria-current")).toBe("true");
    expect(chip("Dados de baja").getAttribute("aria-current")).toBeNull();
    expect(chip("Dados de baja").getAttribute("href")).toBe("/staff/clients?status=deactivated");
  });

  it("keeps the search and goes back to page 1 when the filter changes", () => {
    render(<ClientsFilters params={{ q: "ana", page: 3, status: "active", expiringSoon: false, everyone: false }} />);

    expect(chip("Dados de baja").getAttribute("href")).toBe("/staff/clients?status=deactivated&q=ana");
  });

  it("marks Dados de baja as the current one and links back to the bare list", () => {
    render(<ClientsFilters params={{ q: "", page: 1, status: "deactivated", expiringSoon: false, everyone: false }} />);

    expect(chip("Dados de baja").getAttribute("aria-current")).toBe("true");
    expect(chip("Activos").getAttribute("href")).toBe("/staff/clients");
  });

  it("rounds the chips and hands the search to its field", () => {
    render(<ClientsFilters params={{ q: "ana", page: 1, status: "active", expiringSoon: false, everyone: false }} />);

    expect(chip("Activos").className).toContain("rounded-full");
    expect(chip("Dados de baja").className).toContain("rounded-full");
    expect(screen.getByText("search for «ana»")).toBeDefined();
  });

  it("links Vence pronto to the active clients that are about to expire", () => {
    render(<ClientsFilters params={{ q: "ana", page: 3, status: "deactivated", expiringSoon: false, everyone: false }} />);

    expect(chip("Vence pronto").getAttribute("href")).toBe("/staff/clients?vence=pronto&q=ana");
    expect(chip("Vence pronto").getAttribute("aria-current")).toBeNull();
  });

  it("marks Vence pronto as the current filter instead of Activos", () => {
    render(<ClientsFilters params={{ q: "", page: 1, status: "active", expiringSoon: true, everyone: false }} />);

    expect(chip("Vence pronto").getAttribute("aria-current")).toBe("true");
    expect(chip("Activos").getAttribute("aria-current")).toBeNull();
    expect(chip("Activos").getAttribute("href")).toBe("/staff/clients");
  });

  it("lists the chips in order: Activos, Vence pronto, Todos, Dados de baja", () => {
    render(<ClientsFilters params={{ q: "", page: 1, status: "active", expiringSoon: false, everyone: false }} />);

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Activos",
      "Vence pronto",
      "Todos",
      "Dados de baja",
    ]);
  });

  it("links Todos to the whole list and keeps the search", () => {
    render(<ClientsFilters params={{ q: "ana", page: 3, status: "deactivated", expiringSoon: false, everyone: false }} />);

    expect(chip("Todos").getAttribute("href")).toBe("/staff/clients?ver=todos&q=ana");
    expect(chip("Todos").getAttribute("aria-current")).toBeNull();
  });

  it("marks Todos as the current filter instead of Activos, and Activos links back to the bare list", () => {
    render(<ClientsFilters params={{ q: "", page: 1, status: "active", expiringSoon: false, everyone: true }} />);

    expect(chip("Todos").getAttribute("aria-current")).toBe("true");
    expect(chip("Activos").getAttribute("aria-current")).toBeNull();
    expect(chip("Activos").getAttribute("href")).toBe("/staff/clients");
  });
});
