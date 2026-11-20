import type { PlanDto } from "@/lib/api/types";

import { presentPlan, type PresentPlanOptions } from "./present-plan";

export interface SelectorOption {
  id: string;
  name: string;
  price: string;
  features: string[];
  featured: boolean;
  actionLabel: string;
  actionHref: string | null;
}

export function presentSelectorPlans(plans: PlanDto[], options?: PresentPlanOptions): SelectorOption[] {
  return plans.map((plan) => {
    const { name, price, highlighted, actionLabel, actionHref } = presentPlan(plan, options);

    return {
      id: plan.id,
      name,
      price,
      features: plan.features,
      featured: highlighted ?? false,
      actionLabel,
      actionHref,
    };
  });
}
