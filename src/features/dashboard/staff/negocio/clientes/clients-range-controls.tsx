import Link from "next/link";

import { cn } from "@/lib/cn";

import { CLIENTS_RANGE_PARAMS, dashboardHref, type ClientsRangeParam, type DashboardParams } from "../../dashboard-params";

const OPTIONS: readonly { value: ClientsRangeParam; label: string }[] = [
  { value: CLIENTS_RANGE_PARAMS.LAST_30_DAYS, label: "30 días" },
  { value: CLIENTS_RANGE_PARAMS.LAST_3_MONTHS, label: "3 meses" },
  { value: CLIENTS_RANGE_PARAMS.LAST_6_MONTHS, label: "6 meses" },
  { value: CLIENTS_RANGE_PARAMS.ALL, label: "Todo" },
];

/** The range of the Clientes tab: always ends today. Links, so the range is in the URL. */
export function ClientsRangeControls({ params }: { params: DashboardParams }) {
  return (
    <div role="group" aria-label="Rango" className="flex flex-wrap gap-1.5">
      {OPTIONS.map(({ value, label }) => (
        <Link
          key={value}
          href={dashboardHref({ ...params, clientsRange: value })}
          aria-current={params.clientsRange === value ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-full border px-3 text-xs transition-colors sm:min-h-0 sm:py-1.5",
            params.clientsRange === value ? "border-white text-white" : "border-line text-muted hover:text-white",
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
