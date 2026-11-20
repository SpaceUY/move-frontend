import { Suspense } from "react";

import type { PlanDto } from "@/lib/api/types";
import { cn } from "@/lib/cn";

import { getPlans } from "./get-plans";
import { PlanSelector } from "./plan-selector";
import type { PresentPlanOptions } from "./present-plan";
import { presentSelectorPlans } from "./present-selector-plans";
import { SELECTOR_SERVICES, SERVICE_ORDER, type SelectorService } from "./service-copy";

interface PlansSelectorSectionProps {
  className?: string;
  reserveHref?: PresentPlanOptions["reserveHref"];
}

function PlansMessage({ children }: { children: string }) {
  return (
    <div className="flex items-center rounded border border-line bg-card p-7 text-sm text-muted">
      {children}
    </div>
  );
}

type ServiceEntry =
  | { service: SelectorService; failed: true }
  | { service: SelectorService; failed: false; options: ReturnType<typeof presentSelectorPlans> };

function ServiceCard({ entry }: { entry: ServiceEntry }) {
  const { label, ...copy } = SELECTOR_SERVICES[entry.service];

  if (entry.failed) {
    return <PlansMessage>{`No pudimos cargar los planes de ${label}. Probá de nuevo en unos minutos.`}</PlansMessage>;
  }

  return <PlanSelector id={entry.service} label={label} {...copy} options={entry.options} />;
}

// A service with no published plans gets no card; a failed load keeps its message.
function toServiceEntries(
  results: PromiseSettledResult<PlanDto[]>[],
  reserveHref?: PresentPlanOptions["reserveHref"],
): ServiceEntry[] {
  return SERVICE_ORDER.flatMap((service, index): ServiceEntry[] => {
    const result = results[index];
    if (result.status === "rejected") return [{ service, failed: true }];

    const options = presentSelectorPlans(result.value, { reserveHref });
    return options.length > 0 ? [{ service, failed: false, options }] : [];
  });
}

export function PlansSelectorSection({ className, reserveHref }: PlansSelectorSectionProps) {
  return (
    <Suspense
      fallback={<p className={cn("text-sm text-muted", className)}>Cargando planes…</p>}
    >
      <PlansSelectorList className={className} reserveHref={reserveHref} />
    </Suspense>
  );
}

export async function PlansSelectorList({ className, reserveHref }: PlansSelectorSectionProps) {
  // One service failing must not hide the other, so each is settled on its own.
  const results = await Promise.allSettled(SERVICE_ORDER.map((service) => getPlans(service)));

  const entries = toServiceEntries(results, reserveHref);

  if (entries.length === 0) {
    return (
      <div className={cn("mx-auto w-full max-w-[34rem]", className)}>
        <PlansMessage>Todavía no hay planes publicados.</PlansMessage>
      </div>
    );
  }

  // One card keeps the width of a column and sits in the middle.
  const layout = entries.length > 1 ? "grid gap-6 md:grid-cols-2" : "mx-auto w-full max-w-[34rem]";

  return (
    <div className={cn(layout, className)}>
      {entries.map((entry) => (
        <ServiceCard key={entry.service} entry={entry} />
      ))}
    </div>
  );
}
