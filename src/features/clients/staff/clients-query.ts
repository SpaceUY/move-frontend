import { CLIENT_ACCOUNT_STATUSES } from "@/lib/api/types";
import type { ClientAccountStatus } from "@/lib/api/types";

export interface ClientsQueryParams {
  q?: string;
  page?: number;
  pageSize?: number;
  status?: ClientAccountStatus;
  expiringSoon?: boolean;
  // Only the clients active today (a plan in force or recent activity), the rule of the dashboard's "Clientes activos".
  activeNow?: boolean;
}

export const CLIENTS_PATH = "/api/v1/staff/clients";

/** The list endpoint with its query string; active is the backend's default, so the URL of the active list stays as it was. */
export function clientsListPath(params: ClientsQueryParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.status === CLIENT_ACCOUNT_STATUSES.DEACTIVATED) search.set("status", params.status);
  if (params.expiringSoon) search.set("expiringSoon", "true");
  if (params.activeNow) search.set("activeNow", "true");
  const qs = search.toString();
  return qs ? `${CLIENTS_PATH}?${qs}` : CLIENTS_PATH;
}
