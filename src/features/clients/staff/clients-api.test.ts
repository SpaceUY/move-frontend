// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetchClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { ClientDetail, ClientPage, ClientRow, DeactivationPreview } from "@/lib/api/types";

import {
  createClient,
  deactivateClient,
  findClientIdByEmail,
  getDeactivationPreview,
  listClients,
  reactivateClient,
  setClientPassword,
  updateClientProfile,
} from "./clients-api";

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetchClient: vi.fn(),
}));

const apiFetchClientMock = vi.mocked(apiFetchClient);

const JSON_HEADERS = { "Content-Type": "application/json" };

const DETAIL: ClientDetail = {
  id: "c1",
  name: "Ana",
  lastName: "Gómez",
  email: "ana@move.test",
  phone: "+59899123456",
  birthDate: "1990-03-12",
  age: 36,
  clientSince: "2026-01-10T12:00:00.000Z",
  plan: null,
  paymentStatus: null,
  bookings: [],
  deactivation: null,
};

const row = (email: string, id: string): ClientRow => ({
  id,
  name: "Pendiente",
  lastName: null,
  email,
  phone: null,
  nextBookingAt: null,
  lastAttendanceStatus: null,
  deactivatedAt: null,
});

const page = (items: ClientRow[]): ClientPage => ({ items, total: items.length, page: 1, pageSize: 20 });

describe("staff clients API", () => {
  beforeEach(() => {
    apiFetchClientMock.mockReset();
  });

  it("lists active clients without a status param", async () => {
    apiFetchClientMock.mockResolvedValue(Response.json(page([])));

    await listClients({ page: 1, pageSize: 20, status: "active" });

    expect(apiFetchClientMock).toHaveBeenCalledWith("/api/v1/staff/clients?page=1&pageSize=20");
  });

  it("asks for the clients active today with activeNow=true, next to the search and the page", async () => {
    apiFetchClientMock.mockResolvedValue(Response.json(page([])));

    await listClients({ q: "ana", page: 2, pageSize: 20, activeNow: true });

    expect(apiFetchClientMock).toHaveBeenCalledWith("/api/v1/staff/clients?q=ana&page=2&pageSize=20&activeNow=true");
  });

  it("leaves activeNow out of the URL when it is false", async () => {
    apiFetchClientMock.mockResolvedValue(Response.json(page([])));

    await listClients({ page: 1, pageSize: 20, activeNow: false });

    expect(apiFetchClientMock).toHaveBeenCalledWith("/api/v1/staff/clients?page=1&pageSize=20");
  });

  it("lists deactivated clients with status=deactivated", async () => {
    apiFetchClientMock.mockResolvedValue(Response.json(page([])));

    await listClients({ page: 1, pageSize: 20, status: "deactivated" });

    expect(apiFetchClientMock).toHaveBeenCalledWith(
      "/api/v1/staff/clients?page=1&pageSize=20&status=deactivated",
    );
  });

  it("creates a client with a POST of the six fields", async () => {
    apiFetchClientMock.mockResolvedValue(Response.json(DETAIL, { status: 201 }));
    const input = {
      name: "Ana",
      lastName: "Gómez",
      email: "ana@move.test",
      phone: "+59899123456",
      birthDate: "1990-03-12",
      password: "Clave-Segura1",
    };

    await expect(createClient(input)).resolves.toEqual(DETAIL);
    expect(apiFetchClientMock).toHaveBeenCalledWith("/api/v1/staff/clients", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  });

  it("updates only the given profile fields with a PATCH", async () => {
    apiFetchClientMock.mockResolvedValue(Response.json(DETAIL));

    await updateClientProfile("c1", { lastName: "Gómez" });

    expect(apiFetchClientMock).toHaveBeenCalledWith("/api/v1/staff/clients/c1", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: '{"lastName":"Gómez"}',
    });
  });

  it("sets the password with a PUT and resolves on 204", async () => {
    apiFetchClientMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(setClientPassword("c1", "Clave-Segura1")).resolves.toBeUndefined();
    expect(apiFetchClientMock).toHaveBeenCalledWith("/api/v1/staff/clients/c1/password", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ password: "Clave-Segura1" }),
    });
  });

  it("throws ApiError when the password PUT fails", async () => {
    apiFetchClientMock.mockResolvedValue(
      Response.json({ statusCode: 404, code: "CLIENT_NOT_FOUND", message: "No existe." }, { status: 404 }),
    );

    await expect(setClientPassword("c1", "Clave-Segura1")).rejects.toBeInstanceOf(ApiError);
  });

  it("deactivates with the reason, or with an empty body when there is none", async () => {
    apiFetchClientMock.mockImplementation(() => Promise.resolve(Response.json(DETAIL)));

    await deactivateClient("c1", "Se mudó");
    await deactivateClient("c1", null);

    expect(apiFetchClientMock).toHaveBeenNthCalledWith(1, "/api/v1/staff/clients/c1/deactivate", {
      method: "POST",
      headers: JSON_HEADERS,
      body: '{"reason":"Se mudó"}',
    });
    expect(apiFetchClientMock).toHaveBeenNthCalledWith(2, "/api/v1/staff/clients/c1/deactivate", {
      method: "POST",
      headers: JSON_HEADERS,
      body: "{}",
    });
  });

  it("reactivates with an empty body", async () => {
    apiFetchClientMock.mockResolvedValue(Response.json(DETAIL));

    await reactivateClient("c1");

    expect(apiFetchClientMock).toHaveBeenCalledWith("/api/v1/staff/clients/c1/reactivate", {
      method: "POST",
      headers: JSON_HEADERS,
      body: "{}",
    });
  });

  it("reads the deactivation preview", async () => {
    const preview: DeactivationPreview = { upcomingBookings: 3, hasCurrentPlan: true, autoDebits: 1, recoverySessionsLeft: 0 };
    apiFetchClientMock.mockResolvedValue(Response.json(preview));

    await expect(getDeactivationPreview("c1")).resolves.toEqual(preview);
    expect(apiFetchClientMock).toHaveBeenCalledWith("/api/v1/staff/clients/c1/deactivation-preview");
  });

  it("findClientIdByEmail returns the row with the exact email, ignoring case", async () => {
    apiFetchClientMock.mockResolvedValue(
      Response.json(page([row("pendiente@move.test.ar", "c-other"), row("pendiente@move.test", "c-pend")])),
    );

    await expect(findClientIdByEmail("Pendiente@Move.test")).resolves.toBe("c-pend");
    expect(apiFetchClientMock).toHaveBeenCalledWith("/api/v1/staff/clients?q=Pendiente%40Move.test");
  });

  it("findClientIdByEmail returns null without an exact match and when the request fails", async () => {
    apiFetchClientMock.mockResolvedValueOnce(Response.json(page([row("otro@move.test", "c-other")])));
    await expect(findClientIdByEmail("pendiente@move.test")).resolves.toBeNull();

    apiFetchClientMock.mockRejectedValueOnce(new Error("network"));
    await expect(findClientIdByEmail("pendiente@move.test")).resolves.toBeNull();

    apiFetchClientMock.mockResolvedValueOnce(
      Response.json({ statusCode: 500, code: "INTERNAL", message: "x" }, { status: 500 }),
    );
    await expect(findClientIdByEmail("pendiente@move.test")).resolves.toBeNull();
  });
});
