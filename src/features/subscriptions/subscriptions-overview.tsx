import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { ROUTES } from "@/config/constants/routes.constants";
import { AutoDebitLine } from "@/features/auto-debits";
import { cn } from "@/lib/cn";

import { PerformancePlanCard } from "./performance-plan-card";
import type { SubscriptionsModel } from "./present-subscriptions";
import { RecoveryPacksCard } from "./recovery-packs-card";

export interface SubscriptionsOverviewProps {
  model: SubscriptionsModel;
}

export function SubscriptionsOverview({ model }: SubscriptionsOverviewProps) {
  return (
    <div className="mt-10 max-w-[796px] space-y-6">
      {model.isEmpty ? <EmptySubscriptionsCard /> : null}
      {/* A debit can outlive its card (its first charge may fail), so each service still shows its line without one. */}
      {model.performance ? (
        <PerformancePlanCard plan={model.performance} upcoming={model.upcoming} />
      ) : (
        <AutoDebitLine service="performance" paidUntil={null} standalone />
      )}
      {model.recoveryPacks.length > 0 ? (
        <RecoveryPacksCard packs={model.recoveryPacks} />
      ) : (
        <AutoDebitLine service="recovery" paidUntil={null} standalone />
      )}
    </div>
  );
}

function EmptySubscriptionsCard() {
  return (
    <Card>
      <Heading as="h2" size="sm">
        Todavía no tenés un plan activo
      </Heading>
      <p className="mt-2 text-sm text-muted">
        Elegí un plan de Performance o un paquete de Recovery para empezar a reservar.
      </p>
      <Link href={ROUTES.PLANS} className={cn(buttonVariants({ variant: "primary", touchTarget: true }), "mt-6")}>
        Ver planes
      </Link>
    </Card>
  );
}
