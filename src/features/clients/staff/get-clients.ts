import { parseJsonOrThrow } from "@/lib/api/client";
import { apiFetchServer } from "@/lib/api/server";
import { CLIENT_ACCOUNT_STATUSES } from "@/lib/api/types";
import type { ClientPage } from "@/lib/api/types";

import { CLIENTS_PAGE_SIZE, type ClientsListParams } from "./clients-list-params";
import { clientsListPath } from "./clients-query";

// Server-side only: apiFetchServer forwards the staff member's session cookies.
export async function getClients(params: ClientsListParams): Promise<ClientPage> {
  const response = await apiFetchServer(
    clientsListPath({
      q: params.q,
      page: params.page,
      pageSize: CLIENTS_PAGE_SIZE,
      status: params.status,
      expiringSoon: params.expiringSoon,
      // Only the "Activos" tab: not the deactivated list, not "vence pronto" (already a subset of it), not "Todos".
      activeNow: params.status === CLIENT_ACCOUNT_STATUSES.ACTIVE && !params.expiringSoon && !params.everyone,
    }),
  );
  return parseJsonOrThrow<ClientPage>(response);
}
