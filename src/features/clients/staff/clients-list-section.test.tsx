import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { ClientPage } from "@/lib/api/types";

import { ClientsListSection } from "./clients-list-section";
import { getClients } from "./get-clients";

vi.mock("./get-clients");

const getClientsMock = vi.mocked(getClients);

const page: ClientPage = { items: [], total: 0, page: 1, pageSize: 20 };

describe("ClientsListSection", () => {
  beforeEach(() => {
    getClientsMock.mockReset();
  });

  it("asks for what the URL says and shows the list", async () => {
    getClientsMock.mockResolvedValue(page);

    render(await ClientsListSection({ params: { q: "", page: 1, status: "deactivated", expiringSoon: false, everyone: false } }));

    expect(getClientsMock).toHaveBeenCalledWith({ q: "", page: 1, status: "deactivated", expiringSoon: false, everyone: false });
    expect(screen.getByText("No hay clientes dados de baja")).toBeDefined();
  });

  it("shows an alert with a retry link to the same view when the API fails", async () => {
    getClientsMock.mockRejectedValue(new ApiError({ statusCode: 500, code: "INTERNAL", message: "x" }));

    render(await ClientsListSection({ params: { q: "ana", page: 2, status: "active", expiringSoon: false, everyone: false } }));

    expect(screen.getByRole("alert").textContent).toContain("No pudimos cargar la lista de clientes");
    expect(screen.getByRole("link", { name: "Reintentar" }).getAttribute("href")).toBe(
      "/staff/clients?q=ana&page=2",
    );
  });
});
