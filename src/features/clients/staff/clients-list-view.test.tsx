import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ClientPage, ClientRow } from "@/lib/api/types";

import type { ClientsListParams } from "./clients-list-params";
import { ClientsListSkeleton, ClientsListView } from "./clients-list-view";

const ACTIVE: ClientsListParams = { q: "", page: 1, status: "active", expiringSoon: false, everyone: false };
const DEACTIVATED: ClientsListParams = { q: "", page: 1, status: "deactivated", expiringSoon: false, everyone: false };

function pageOf(overrides: Partial<ClientPage> = {}): ClientPage {
  return { items: [], total: 0, page: 1, pageSize: 20, ...overrides };
}

function rowOf(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: "c1",
    name: "Ana",
    lastName: "Gomez",
    email: "ana@move.uy",
    phone: "+59899123456",
    nextBookingAt: null,
    lastAttendanceStatus: null,
    deactivatedAt: null,
    ...overrides,
  };
}

const href = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");

describe("ClientsListView", () => {
  it("lists clients with their next booking and attendance status", () => {
    render(
      <ClientsListView
        params={ACTIVE}
        data={pageOf({
          items: [rowOf({ nextBookingAt: "2026-11-01T10:00:00.000Z", lastAttendanceStatus: "present" })],
          total: 1,
        })}
      />,
    );

    expect(screen.getByText("1 cliente activo.")).toBeDefined();
    expect(screen.getByText("Ana Gomez")).toBeDefined();
    expect(screen.getByText("ana@move.uy")).toBeDefined();
    expect(screen.getByText("Presente")).toBeDefined();
    expect(href(/Ver ficha/)).toBe("/staff/clients/c1");
  });

  it("keeps the count of active clients above the list", () => {
    render(<ClientsListView params={ACTIVE} data={pageOf({ items: [rowOf()], total: 7 })} />);

    const count = screen.getByText("7 clientes activos.");
    expect(screen.getByRole("table").compareDocumentPosition(count) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("shows the deactivation date instead of the next booking and the last attendance", () => {
    render(
      <ClientsListView
        params={DEACTIVATED}
        data={pageOf({ items: [rowOf({ deactivatedAt: "2026-11-02T15:00:00.000Z" })], total: 1 })}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Dado de baja" })).toBeDefined();
    expect(screen.getByText("02/11/2026")).toBeDefined();
    expect(screen.queryByText("Próxima reserva")).toBeNull();
    expect(screen.queryByText("Última asistencia")).toBeNull();
  });

  it("counts the deactivated clients below the table, in singular and plural", () => {
    const { rerender } = render(
      <ClientsListView
        params={DEACTIVATED}
        data={pageOf({ items: [rowOf({ deactivatedAt: "2026-11-02T15:00:00.000Z" })], total: 3 })}
      />,
    );
    const count = screen.getByText("3 clientes dados de baja.");
    expect(screen.getByRole("table").compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(
      <ClientsListView
        params={DEACTIVATED}
        data={pageOf({ items: [rowOf({ deactivatedAt: "2026-11-02T15:00:00.000Z" })], total: 1 })}
      />,
    );
    expect(screen.getByText("1 cliente dado de baja.")).toBeDefined();
  });

  it("paginates with links that keep the search and the filter", () => {
    render(
      <ClientsListView
        params={{ q: "ana", page: 2, status: "deactivated", expiringSoon: false, everyone: false }}
        data={pageOf({ items: [rowOf()], total: 45, page: 2 })}
      />,
    );

    expect(screen.getByText("Mostrando 21–40 de 45")).toBeDefined();
    expect(href("Ir a la página anterior")).toBe("/staff/clients?status=deactivated&q=ana");
    expect(href("Ir a la página siguiente")).toBe("/staff/clients?status=deactivated&q=ana&page=3");
  });

  it("disables the first previous and the last next", () => {
    const { rerender } = render(<ClientsListView params={ACTIVE} data={pageOf({ items: [rowOf()], total: 45 })} />);
    expect(screen.getByRole("button", { name: "Ir a la página anterior" })).toHaveProperty("disabled", true);
    expect(href("Ir a la página siguiente")).toBe("/staff/clients?page=2");

    rerender(<ClientsListView params={{ ...ACTIVE, page: 3 }} data={pageOf({ items: [rowOf()], total: 45, page: 3 })} />);
    expect(screen.getByRole("button", { name: "Ir a la página siguiente" })).toHaveProperty("disabled", true);
  });

  it("shows a clear empty state, with a way back, when the search has no matches", () => {
    render(<ClientsListView params={{ q: "xyz123", page: 1, status: "active", expiringSoon: false, everyone: false }} data={pageOf()} />);

    expect(screen.getByText("Ningún cliente coincide con la búsqueda")).toBeDefined();
    expect(screen.getByText("No encontramos resultados para «xyz123» entre los clientes activos.")).toBeDefined();
    expect(href("Ver todos")).toBe("/staff/clients");
  });

  it("does not say the search was among active clients when it was among the deactivated ones", () => {
    render(<ClientsListView params={{ ...DEACTIVATED, q: "xyz123" }} data={pageOf()} />);

    expect(screen.getByText("No encontramos resultados para «xyz123».")).toBeDefined();
  });

  it("shows its own empty state for the deactivated view", () => {
    render(<ClientsListView params={DEACTIVATED} data={pageOf()} />);

    expect(screen.getByText("No hay clientes dados de baja")).toBeDefined();
    expect(screen.getByText("Cuando des de baja a un cliente desde su ficha va a aparecer acá.")).toBeDefined();
  });

  it("says nobody is about to expire when that filter is empty", () => {
    render(<ClientsListView params={{ ...ACTIVE, expiringSoon: true }} data={pageOf()} />);

    expect(screen.getByText("Nadie vence pronto")).toBeDefined();
    expect(href("Ver todos los clientes")).toBe("/staff/clients");
  });

  it("says how many clients are about to expire instead of how many are registered", () => {
    const expiring = { ...ACTIVE, expiringSoon: true };
    const { unmount } = render(<ClientsListView params={expiring} data={pageOf({ items: [rowOf()], total: 1 })} />);

    expect(screen.getByText("1 cliente vence pronto.")).toBeDefined();
    expect(screen.queryByText(/registrados/)).toBeNull();
    unmount();

    render(<ClientsListView params={expiring} data={pageOf({ items: [rowOf()], total: 3 })} />);

    expect(screen.getByText("3 clientes vencen pronto.")).toBeDefined();
  });

  it("counts every registered client in the Todos tab", () => {
    const everyone = { ...ACTIVE, everyone: true };
    const { unmount } = render(<ClientsListView params={everyone} data={pageOf({ items: [rowOf()], total: 1 })} />);

    expect(screen.getByText("1 cliente registrado.")).toBeDefined();
    unmount();

    render(<ClientsListView params={everyone} data={pageOf({ items: [rowOf()], total: 730 })} />);

    expect(screen.getByText("730 clientes registrados.")).toBeDefined();
  });

  it("keeps the first-use empty state, and a search without the active-only wording, in the Todos tab", () => {
    const everyone = { ...ACTIVE, everyone: true };
    const { unmount } = render(<ClientsListView params={everyone} data={pageOf()} />);

    expect(screen.getByText("Todavía no hay clientes")).toBeDefined();
    unmount();

    render(<ClientsListView params={{ ...everyone, q: "xyz123" }} data={pageOf()} />);

    expect(screen.getByText("No encontramos resultados para «xyz123».")).toBeDefined();
  });

  it("says there are no active clients, and what makes one, when the active list is empty", () => {
    render(<ClientsListView params={ACTIVE} data={pageOf()} />);

    expect(screen.getByText("No hay clientes activos")).toBeDefined();
    expect(screen.getByText("Cuando un cliente tenga un plan vigente va a aparecer acá.")).toBeDefined();
  });

  it("offers the first page when the URL names a page past the last one", () => {
    render(<ClientsListView params={{ ...ACTIVE, page: 9 }} data={pageOf({ total: 45, page: 9 })} />);

    expect(screen.getByText("Esta página no tiene clientes")).toBeDefined();
    expect(href("Ir a la primera página")).toBe("/staff/clients");
  });
});

describe("ClientsListSkeleton", () => {
  it("announces the loading and keeps the columns of the chosen view", () => {
    render(<ClientsListSkeleton status="deactivated" />);

    expect(screen.getByText("Cargando clientes…")).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Dado de baja" })).toBeDefined();
  });
});
