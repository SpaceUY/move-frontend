import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  MySubscriptionsDto,
  PerformanceSubscriptionDto,
  RecoveryPackDto,
} from "@/lib/api/types";

vi.mock("@/features/auto-debits", () => ({
  AutoDebitLine: ({
    service,
    paidUntil,
    standalone = false,
  }: {
    service: string;
    paidUntil: string | null;
    standalone?: boolean;
  }) => <p data-standalone={String(standalone)}>{`debit line ${service} until ${String(paidUntil)}`}</p>,
}));

import { presentSubscriptions } from "./present-subscriptions";
import { SubscriptionsOverview } from "./subscriptions-overview";

const activePlan: PerformanceSubscriptionDto = {
  id: "p1",
  planId: "plan-trimestral",
  planName: "Trimestral",
  startsOn: "2026-08-15",
  endsOn: "2026-11-15",
  status: "active",
  daysLeft: 34,
  expiringSoon: false,
  purchaseId: null,
  awaitingPayment: false,
};

const pack = (overrides: Partial<RecoveryPackDto>): RecoveryPackDto => ({
  id: "r1",
  planId: "plan-2",
  planName: "Paquete 4 sesiones",
  startsOn: "2026-10-10",
  endsOn: "2026-11-08",
  sessionsTotal: 4,
  sessionsUsed: 1,
  sessionsLeft: 3,
  daysLeft: 27,
  expiringSoon: false,
  purchaseId: null,
  awaitingPayment: false,
  ...overrides,
});

const renderOverview = (dto: Partial<MySubscriptionsDto>) =>
  render(
    <SubscriptionsOverview
      model={presentSubscriptions({
        performance: null,
        upcomingPerformances: [],
        recoveryPacks: [],
        ...dto,
      })}
    />,
  );

describe("SubscriptionsOverview", () => {
  it("shows an active plan with its days left and the bar between its dates, without a renew link", () => {
    renderOverview({ performance: activePlan });

    expect(screen.getByRole("heading", { name: "Plan Trimestral" })).toBeDefined();
    expect(screen.getByText("Activo")).toBeDefined();
    expect(screen.getByText("34")).toBeDefined();
    expect(screen.getByText("días restantes")).toBeDefined();
    expect(screen.getByRole("progressbar", { name: "Progreso del período" })).toBeDefined();
    expect(screen.getByText("Inicio 15/08/2026")).toBeDefined();
    expect(screen.getByText("Vence 15/11/2026")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Renovar plan" })).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("warns about a plan that is about to expire, with a link to renew, and keeps its bar green", () => {
    renderOverview({ performance: { ...activePlan, daysLeft: 10, expiringSoon: true } });

    expect(screen.getByText("Por vencer")).toBeDefined();
    expect(screen.queryByText("Activo")).toBeNull();
    expect(screen.getByText("10").className).toContain("text-warning");
    const renew = screen.getByRole("link", { name: "Renovar plan" });
    expect(renew.getAttribute("href")).toBe("/plans");
    expect(renew.className).toContain("min-h-11");
    expect(screen.getByRole("progressbar").firstElementChild?.className).toContain("bg-success");
  });

  it("shows no warning and no renew link when the back did not flag the plan, however few days are left", () => {
    renderOverview({ performance: { ...activePlan, daysLeft: 3, expiringSoon: false } });

    expect(screen.queryByText("Por vencer")).toBeNull();
    expect(screen.queryByRole("link", { name: "Renovar plan" })).toBeNull();
    expect(screen.getByText("3").className).not.toContain("text-warning");
  });

  it("shows a scheduled plan with its period line and no progress", () => {
    renderOverview({ performance: { ...activePlan, status: "scheduled", daysLeft: 120 } });

    expect(screen.getByText("Próximo")).toBeDefined();
    expect(screen.getByText(/vence el/)).toBeDefined();
    expect(screen.getByText("15/11/2026")).toBeDefined();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("tells the client what to do when the plan expired, with a touch-sized link to the plans", () => {
    renderOverview({ performance: { ...activePlan, status: "expired", daysLeft: 0 } });

    expect(screen.getByText("Vencido")).toBeDefined();
    expect(screen.getByText("Tu plan venció. Elegí uno nuevo para seguir reservando.")).toBeDefined();
    const plans = screen.getByRole("link", { name: "Ver planes" });
    expect(plans.getAttribute("href")).toBe("/plans");
    expect(plans.className).toContain("min-h-11");
  });

  it("shows no expired-plan text and no plans link while the plan is active", () => {
    renderOverview({ performance: activePlan });

    expect(screen.queryByText(/Tu plan venció/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver planes" })).toBeNull();
  });

  it("shows the next plan as already paid, below a divider", () => {
    renderOverview({
      performance: activePlan,
      upcomingPerformances: [
        {
          ...activePlan,
          id: "p2",
          planName: "Semestral",
          status: "scheduled",
          startsOn: "2026-11-16",
          endsOn: "2027-05-16",
        },
      ],
    });

    expect(screen.getByRole("heading", { name: "Plan Semestral" })).toBeDefined();
    expect(screen.getByText("Ya pagado")).toBeDefined();
    expect(
      screen.getByText("Empieza el 16/11/2026, cuando termina tu plan actual · hasta 16/05/2027"),
    ).toBeDefined();
    expect(screen.getByRole("separator")).toBeDefined();
  });

  it("shows every queued plan, one below the other, under a single divider", () => {
    renderOverview({
      performance: activePlan,
      upcomingPerformances: [
        { ...activePlan, id: "p2", planName: "Semestral", status: "scheduled", startsOn: "2027-01-22", endsOn: "2027-07-21" },
        { ...activePlan, id: "p3", planName: "Mensual", status: "scheduled", startsOn: "2027-07-22", endsOn: "2027-08-21" },
      ],
    });

    expect(screen.getAllByText("Ya pagado")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Plan Semestral" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Plan Mensual" })).toBeDefined();
    expect(
      screen.getByText("Empieza el 22/07/2027, cuando termina el plan anterior · hasta 21/08/2027"),
    ).toBeDefined();
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("shows no queued plan and no divider when nothing is queued", () => {
    renderOverview({ performance: activePlan });

    expect(screen.queryByText("Ya pagado")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("lists the Recovery packs in API order, one bar per session, and flags only the exhausted one", () => {
    renderOverview({
      recoveryPacks: [
        pack({ id: "r1", planName: "Paquete 4 sesiones" }),
        pack({
          id: "r2",
          planName: "Paquete 8 sesiones",
          sessionsTotal: 8,
          sessionsUsed: 8,
          sessionsLeft: 0,
        }),
      ],
    });

    expect(screen.getByText("Recovery · Tus paquetes")).toBeDefined();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(within(items[0]).getByRole("heading", { name: "Paquete 4 sesiones" })).toBeDefined();
    expect(within(items[0]).queryByText("Sin sesiones")).toBeNull();
    const firstMeter = within(items[0]).getByRole("meter", { name: "Sesiones usadas" });
    expect(firstMeter.getAttribute("aria-valuenow")).toBe("1");
    expect(firstMeter.getAttribute("aria-valuemax")).toBe("4");
    expect(firstMeter.getAttribute("aria-valuetext")).toBe("1 de 4 sesiones usadas");
    expect(firstMeter.children).toHaveLength(4);
    expect(Array.from(firstMeter.children).map((bar) => bar.className.includes("bg-success"))).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(within(items[0]).getByText("Vence en 27 días · 08/11/2026")).toBeDefined();

    expect(within(items[1]).getByRole("heading", { name: "Paquete 8 sesiones" })).toBeDefined();
    expect(within(items[1]).getByText("Sin sesiones")).toBeDefined();
    expect(within(items[1]).getByRole("meter").children).toHaveLength(8);
  });

  it("warns about a pack that is about to expire, with a link to renew, and keeps its bar green", () => {
    renderOverview({
      recoveryPacks: [pack({ expiringSoon: true, daysLeft: 8, endsOn: "2026-10-20" })],
    });

    expect(screen.getByText("Por vencer")).toBeDefined();
    const expiry = screen.getByText("Vence en 8 días · 20/10/2026");
    expect(expiry.className).toContain("text-warning");
    const renew = screen.getByRole("link", { name: "Renovar plan" });
    expect(renew.getAttribute("href")).toBe("/plans");
    expect(renew.className).toContain("min-h-11");
    const meter = screen.getByRole("meter", { name: "Sesiones usadas" });
    expect(Array.from(meter.children).map((bar) => bar.className.includes("bg-success"))).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it("shows no warning and no renew link on a pack the API did not flag", () => {
    renderOverview({ recoveryPacks: [pack({ expiringSoon: false, daysLeft: 3 })] });

    expect(screen.queryByText("Por vencer")).toBeNull();
    expect(screen.queryByRole("link", { name: "Renovar plan" })).toBeNull();
    expect(screen.getByText("Vence en 3 días · 08/11/2026").className).not.toContain("text-warning");
  });

  it("names a single pack in singular", () => {
    renderOverview({ recoveryPacks: [pack({})] });

    expect(screen.getByText("Recovery · Tu paquete")).toBeDefined();
  });

  it("invites the client to pick a plan when there is nothing yet", () => {
    renderOverview({});

    expect(
      screen.getByRole("heading", { name: "Todavía no tenés un plan activo" }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Ver planes" }).getAttribute("href")).toBe("/plans");
  });

  it("puts the debit line of Performance in the plan card, with the end of what the client paid", () => {
    renderOverview({ performance: activePlan });

    expect(screen.getByText("debit line performance until 2026-11-15")).toBeDefined();
    expect(screen.queryByText("debit line performance until null")).toBeNull();
  });

  it("puts the debit line of Recovery once in the packs card, until the last pack ends", () => {
    renderOverview({
      recoveryPacks: [
        pack({ id: "r1", endsOn: "2026-11-08" }),
        pack({ id: "r2", endsOn: "2026-12-01" }),
      ],
    });

    expect(screen.getAllByText(/debit line recovery/)).toHaveLength(1);
    expect(screen.getByText("debit line recovery until 2026-12-01")).toBeDefined();
  });

  it("still offers each service's debit line when there is no card for it, so a debit can always be cancelled", () => {
    renderOverview({});

    expect(screen.getByText("debit line performance until null")).toBeDefined();
    expect(screen.getByText("debit line recovery until null")).toBeDefined();
  });

  it("asks the debit line to draw its own card only when there is no plan card for it", () => {
    renderOverview({ performance: activePlan });

    expect(screen.getByText("debit line performance until 2026-11-15").dataset.standalone).toBe("false");
    expect(screen.getByText("debit line recovery until null").dataset.standalone).toBe("true");
  });

  it("does not repeat a line the card already has", () => {
    renderOverview({ performance: activePlan });

    expect(screen.getAllByText(/debit line performance/)).toHaveLength(1);
    expect(screen.getAllByText(/debit line recovery/)).toHaveLength(1);
  });
});
