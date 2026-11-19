import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { apiFetchServer } from "@/lib/api/server";
import type { ClientPage } from "@/lib/api/types";

import { getClients } from "./get-clients";

vi.mock("@/lib/api/server");

const apiFetchServerMock = vi.mocked(apiFetchServer);

const emptyPage: ClientPage = { items: [], total: 0, page: 1, pageSize: 20 };

describe("getClients", () => {
  beforeEach(() => {
    apiFetchServerMock.mockReset();
  });

  it("asks for the clients active today, without a status, as the page size", async () => {
    apiFetchServerMock.mockResolvedValue(Response.json(emptyPage));

    await getClients({ q: "", page: 1, status: "active", expiringSoon: false, everyone: false });

    expect(apiFetchServerMock).toHaveBeenCalledWith("/api/v1/staff/clients?page=1&pageSize=20&activeNow=true");
  });

  it("asks for every client that is not deactivated, without activeNow, for the Todos tab", async () => {
    apiFetchServerMock.mockResolvedValue(Response.json(emptyPage));

    await getClients({ q: "", page: 1, status: "active", expiringSoon: false, everyone: true });

    expect(apiFetchServerMock).toHaveBeenCalledWith("/api/v1/staff/clients?page=1&pageSize=20");
  });

  it("does not ask for activeNow when the list is the deactivated one", async () => {
    apiFetchServerMock.mockResolvedValue(Response.json(emptyPage));

    await getClients({ q: "", page: 1, status: "deactivated", expiringSoon: false, everyone: false });

    expect(apiFetchServerMock.mock.calls[0]?.[0]).not.toContain("activeNow");
  });

  it("sends the search, the page and the deactivated status", async () => {
    apiFetchServerMock.mockResolvedValue(Response.json(emptyPage));

    await getClients({ q: "ana", page: 2, status: "deactivated", expiringSoon: false, everyone: false });

    expect(apiFetchServerMock).toHaveBeenCalledWith(
      "/api/v1/staff/clients?q=ana&page=2&pageSize=20&status=deactivated",
    );
  });

  it("asks for the clients about to expire with expiringSoon=true", async () => {
    apiFetchServerMock.mockResolvedValue(Response.json(emptyPage));

    await getClients({ q: "", page: 1, status: "active", expiringSoon: true, everyone: false });

    expect(apiFetchServerMock).toHaveBeenCalledWith("/api/v1/staff/clients?page=1&pageSize=20&expiringSoon=true");
  });

  it("returns the parsed page and throws the API error", async () => {
    apiFetchServerMock.mockResolvedValueOnce(Response.json(emptyPage));
    await expect(getClients({ q: "", page: 1, status: "active", expiringSoon: false, everyone: false })).resolves.toEqual(emptyPage);

    apiFetchServerMock.mockResolvedValueOnce(
      Response.json({ statusCode: 500, code: "INTERNAL_ERROR", message: "x" }, { status: 500 }),
    );
    await expect(getClients({ q: "", page: 1, status: "active", expiringSoon: false, everyone: false })).rejects.toBeInstanceOf(ApiError);
  });
});
