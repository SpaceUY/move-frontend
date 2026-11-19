import { parseJsonOrThrow } from "@/lib/api/client";
import { apiFetchServer } from "@/lib/api/server";
import type { ClientsStatsDto } from "@/lib/api/types";

import { toClientsStatsQuery, type DashboardParams } from "../../dashboard-params";

export function getClientsStats(params: DashboardParams): Promise<ClientsStatsDto> {
  return apiFetchServer(`/api/v1/staff/dashboard/stats/clients?${toClientsStatsQuery(params)}`).then(
    parseJsonOrThrow<ClientsStatsDto>,
  );
}
