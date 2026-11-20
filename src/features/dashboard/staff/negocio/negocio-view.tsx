import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { todayBusinessDate } from "@/features/bookings";

import { dashboardHref, DASHBOARD_TABS, type DashboardParams } from "../dashboard-params";
import { ClientesSection } from "./clientes/clientes-section";
import { ClientsRangeControls } from "./clientes/clients-range-controls";
import { NegocioTabs } from "./negocio-tabs";
import { PeriodControls } from "./period-controls";
import { PlataSection } from "./plata/plata-section";
import { ServiceFilter } from "./service-filter";
import { TurnosSection } from "./turnos/turnos-section";

function TabSkeleton() {
  // The one live region of the tab: it announces the loading once, not once per card.
  return (
    <div role="status" className="grid gap-4">
      <span className="sr-only">Cargando estadísticas…</span>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-[108px] bg-card" />
        ))}
      </div>
      <Skeleton className="h-64 bg-card" />
    </div>
  );
}

/**
 * Negocio: tabs, period (or the range, on Clientes) and service on top, the active tab below. The controls are not inside the `Suspense`,
 * so they stay put (and keep their focus) while the numbers reload. The `Suspense` is keyed on the href: when a
 * filter changes the skeleton comes back instead of the old numbers staying under a new filter.
 */
export function NegocioView({ params }: { params: DashboardParams }) {
  return (
    <div className="grid gap-4">
      <NegocioTabs params={params} />
      <div className="flex flex-wrap items-end gap-x-3.5 gap-y-2.5 rounded border border-line bg-card px-3.5 py-3">
        {params.tab === DASHBOARD_TABS.CLIENTES ? (
          <ClientsRangeControls params={params} />
        ) : (
          <PeriodControls params={params} today={todayBusinessDate()} />
        )}
        <ServiceFilter params={params} />
      </div>
      <Suspense key={dashboardHref(params)} fallback={<TabSkeleton />}>
        {params.tab === DASHBOARD_TABS.PLATA ? <PlataSection params={params} /> : null}
        {params.tab === DASHBOARD_TABS.TURNOS ? <TurnosSection params={params} /> : null}
        {params.tab === DASHBOARD_TABS.CLIENTES ? <ClientesSection params={params} /> : null}
      </Suspense>
    </div>
  );
}
