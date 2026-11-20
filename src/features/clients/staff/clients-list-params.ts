import { ROUTES } from "@/config/constants/routes.constants";
// By path: the staff payments feature's index also exports its client panel.
import { parsePage } from "@/features/payments/staff/staff-payments-labels";
import { CLIENT_ACCOUNT_STATUSES } from "@/lib/api/types";
import type { ClientAccountStatus } from "@/lib/api/types";

export const CLIENTS_PAGE_SIZE = 20;

const EXPIRING_SOON_VALUE = "pronto";
const EVERYONE_VALUE = "todos";

type RawParam = string | string[] | undefined;

/** What the clients list shows, all of it in the URL: `/staff/clients?status=deactivated&q=ana&page=2`. */
export interface ClientsListParams {
  q: string;
  page: number;
  status: ClientAccountStatus;
  // Active clients whose plan ends soon: `?vence=pronto`.
  expiringSoon: boolean;
  // Every client that is not deactivated, with or without a plan: `?ver=todos`.
  everyone: boolean;
}

const firstOf = (value: RawParam): string | undefined => (Array.isArray(value) ? value[0] : value);

// The URL is the person's to edit: an unknown status becomes the active list and a page that is not a positive integer becomes 1.
export function parseClientsListParams(params: {
  q?: RawParam;
  page?: RawParam;
  status?: RawParam;
  vence?: RawParam;
  ver?: RawParam;
}): ClientsListParams {
  const status =
    firstOf(params.status) === CLIENT_ACCOUNT_STATUSES.DEACTIVATED
      ? CLIENT_ACCOUNT_STATUSES.DEACTIVATED
      : CLIENT_ACCOUNT_STATUSES.ACTIVE;
  const isActive = status === CLIENT_ACCOUNT_STATUSES.ACTIVE;
  const expiringSoon = isActive && firstOf(params.vence) === EXPIRING_SOON_VALUE;
  return {
    q: firstOf(params.q)?.trim() ?? "",
    page: parsePage(firstOf(params.page)),
    status,
    // Only active clients have a plan about to end.
    expiringSoon,
    // Only the active account list can be widened to everyone, and "vence pronto" is already a narrower choice.
    everyone: isActive && !expiringSoon && firstOf(params.ver) === EVERYONE_VALUE,
  };
}

// The default view is the bare URL, so a filter or a way back never carries a value it does not need.
export function clientsListHref(params: ClientsListParams): string {
  const search = new URLSearchParams();
  if (params.status === CLIENT_ACCOUNT_STATUSES.DEACTIVATED) search.set("status", params.status);
  if (params.expiringSoon) search.set("vence", EXPIRING_SOON_VALUE);
  if (params.everyone) search.set("ver", EVERYONE_VALUE);
  if (params.q) search.set("q", params.q);
  if (params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return qs ? `${ROUTES.STAFF_CLIENTS}?${qs}` : ROUTES.STAFF_CLIENTS;
}
