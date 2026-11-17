import { describe, expect, it } from "vitest";

import type { AutoDebitDto } from "@/lib/api/types";

import { presentAutoDebitLine } from "./present-auto-debit";

const debit = (overrides: Partial<AutoDebitDto> = {}): AutoDebitDto => ({
  id: "debit-1",
  externalReference: "ref-1",
  planId: "plan-1",
  planName: "Mensual",
  service: "performance",
  status: "authorized",
  amount: 3900,
  currency: "UYU",
  frequency: 1,
  frequencyType: "months",
  nextChargeOn: "2026-11-12",
  createdAt: "2026-10-12T10:00:00.000Z",
  cancelledAt: null,
  cancelReason: null,
  ...overrides,
});

describe("presentAutoDebitLine", () => {
  it("shows the active debit with the day and month of the next charge", () => {
    expect(presentAutoDebitLine([debit()], "performance")).toEqual({
      text: "Débito automático activo · próximo cobro 12/11",
      title: "Débito automático activo",
      detail: "Próximo cobro el 12/11",
      tone: "active",
      canCancel: true,
      debitId: "debit-1",
    });
  });

  it("says it is activo without a date when the next charge is unknown", () => {
    expect(presentAutoDebitLine([debit({ nextChargeOn: null })], "performance")).toMatchObject({
      text: "Débito automático activo",
      title: "Débito automático activo",
      detail: null,
      tone: "active",
    });
  });

  it("shows a debit that still needs Mercado Pago authorization", () => {
    expect(presentAutoDebitLine([debit({ status: "pending", nextChargeOn: null })], "performance")).toEqual({
      text: "Débito automático pendiente de autorización",
      title: "Débito automático pendiente de autorización",
      detail: null,
      tone: "pending",
      canCancel: true,
      debitId: "debit-1",
    });
  });

  it("only shows the debit of its own service", () => {
    const recovery = debit({ id: "debit-r", service: "recovery", nextChargeOn: "2026-11-30" });

    expect(presentAutoDebitLine([recovery], "performance")).toBeNull();
    expect(presentAutoDebitLine([recovery], "recovery")?.debitId).toBe("debit-r");
  });

  it("takes the newest active debit of the service", () => {
    const older = debit({ id: "old", createdAt: "2026-09-01T10:00:00.000Z" });
    const newer = debit({ id: "new", status: "pending", createdAt: "2026-10-12T10:00:00.000Z" });

    expect(presentAutoDebitLine([older, newer], "performance")?.debitId).toBe("new");
  });

  it.each([
    ["cancelled", [debit({ status: "cancelled", cancelledAt: "2026-10-13T10:00:00.000Z", cancelReason: "client" })]],
    ["empty", []],
  ] as const)("renders nothing for a %s list", (_name, debits) => {
    expect(presentAutoDebitLine([...debits], "performance")).toBeNull();
  });
});
