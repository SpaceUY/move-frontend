// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { apiFetchServer } from "@/lib/api/server";

import { parseDashboardParams } from "../../dashboard-params";
import { CLIENTS_STATS } from "./clients-fixtures";
import { getClientsStats } from "./get-clients-stats";

vi.mock("@/lib/api/server", () => ({ apiFetchServer: vi.fn() }));

const apiFetchServerMock = vi.mocked(apiFetchServer);

describe("getClientsStats", () => {
  beforeEach(() => {
    apiFetchServerMock.mockReset();
  });

  it("asks the API with the URL range, the service and the grouping of that range, and ignores the period menus", async () => {
    apiFetchServerMock.mockResolvedValue(Response.json(CLIENTS_STATS));
    const params = parseDashboardParams({
      vista: "negocio",
      tab: "clientes",
      periodo: "ultimos-12-meses",
      comparar: "no",
      servicio: "performance",
      agrupar: "mes",
      rango: "3-meses",
    });

    await expect(getClientsStats(params)).resolves.toEqual(CLIENTS_STATS);

    expect(apiFetchServerMock).toHaveBeenCalledWith(
      "/api/v1/staff/dashboard/stats/clients?period=last_3_months&compare=previous&service=performance&granularity=day",
    );
  });

  it("the stats keep leaves.pending, staffLeaves and leavesPending as the API sent them", async () => {
    apiFetchServerMock.mockResolvedValue(Response.json(CLIENTS_STATS));

    const stats = await getClientsStats(parseDashboardParams({}));

    expect(stats.leaves.pending).toBe(5);
    expect(stats.staffLeaves.current).toBe(1);
    expect(stats.series.map((point) => point.leavesPending)).toEqual([0, 0, 2, 3]);
  });

  it("throws on an API error", async () => {
    apiFetchServerMock.mockResolvedValue(Response.json({ statusCode: 500, code: "INTERNAL" }, { status: 500 }));

    await expect(getClientsStats(parseDashboardParams({}))).rejects.toBeInstanceOf(ApiError);
  });
});
