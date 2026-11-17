import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithSnackbar } from "@/test/render-with-snackbar";

import { ApiError } from "@/lib/api/errors";
import type { AutoDebitDto } from "@/lib/api/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./auto-debits-api", () => ({ listMyAutoDebits: vi.fn(), cancelAutoDebit: vi.fn() }));

import { AutoDebitLine } from "./auto-debit-line";
import { cancelAutoDebit, listMyAutoDebits } from "./auto-debits-api";

const listMock = vi.mocked(listMyAutoDebits);
const cancelMock = vi.mocked(cancelAutoDebit);

const debit: AutoDebitDto = {
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
};
const cancelled: AutoDebitDto = { ...debit, status: "cancelled" };

const TITLE = "Débito automático activo";
const DETAIL = "Próximo cobro el 12/11";
const SUCCESS_TITLE = "Débito automático cancelado.";
const SUCCESS_CANCEL_BUTTON = "Sí, cancelar débito";

async function openConfirmation() {
  await userEvent.click(await screen.findByRole("button", { name: "Cancelar débito" }));
}

describe("AutoDebitLine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while the debits are loading", () => {
    listMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);

    expect(container.textContent).toBe("");
  });

  it("renders nothing when the client has no debit for this service", async () => {
    listMock.mockResolvedValue([{ ...debit, service: "recovery" }]);
    const { container } = renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);

    await vi.waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("tells the client the debit could not be loaded, instead of hiding it, and offers to retry", async () => {
    listMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);

    expect((await screen.findByRole("alert")).textContent).toContain("No pudimos cargar tu débito automático.");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeDefined();
  });

  it("shows the debit and its cancel button once the retry works", async () => {
    listMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue([debit]);
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);

    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText(TITLE)).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancelar débito" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps what it knows when a later refresh fails", async () => {
    listMock.mockResolvedValueOnce([debit]).mockRejectedValue(new TypeError("Failed to fetch"));
    cancelMock.mockResolvedValue(cancelled);
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);
    await openConfirmation();

    await userEvent.click(screen.getByRole("button", { name: SUCCESS_CANCEL_BUTTON }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain(SUCCESS_TITLE);
    expect(status.textContent).toContain("Lo que ya pagaste sigue vigente hasta el 18/10/2026.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("shows a debit that still needs Mercado Pago authorization", async () => {
    listMock.mockResolvedValue([{ ...debit, status: "pending", nextChargeOn: null }]);
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);

    expect(await screen.findByText("Débito automático pendiente de autorización")).toBeDefined();
    expect(screen.queryByText(/Próximo cobro/)).toBeNull();
    expect(screen.getByRole("button", { name: "Cancelar débito" })).toBeDefined();
  });

  it("shows the status in two lines: the title and the next charge", async () => {
    listMock.mockResolvedValue([debit]);
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);

    expect(await screen.findByText(TITLE)).toBeDefined();
    expect(screen.getByText(DETAIL)).toBeDefined();
  });

  it("says what stays valid in the success message without an end date", async () => {
    listMock.mockResolvedValue([debit]);
    cancelMock.mockResolvedValue(cancelled);
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil={null} />);
    await openConfirmation();

    await userEvent.click(screen.getByRole("button", { name: SUCCESS_CANCEL_BUTTON }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Lo que ya pagaste sigue vigente.");
    expect(status.textContent).not.toContain("hasta el");
  });

  it("draws itself inside a card when it has no plan card around it", async () => {
    listMock.mockResolvedValue([debit]);
    const { container } = renderWithSnackbar(<AutoDebitLine service="performance" paidUntil={null} standalone />);

    await screen.findByText(TITLE);

    expect(container.firstElementChild?.className).toContain("bg-card");
  });

  it("does not draw a card of its own inside a plan card", async () => {
    listMock.mockResolvedValue([debit]);
    const { container } = renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);

    await screen.findByText(TITLE);

    expect(container.firstElementChild?.className).not.toContain("bg-card");
  });

  it("asks for confirmation before cancelling and says what stays valid", async () => {
    listMock.mockResolvedValue([debit]);
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);

    await openConfirmation();

    expect(screen.getByText("¿Cancelar el débito automático?")).toBeDefined();
    expect(screen.getByText("Lo que ya pagaste sigue vigente hasta el 18/10/2026.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Volver" })).toBeDefined();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("does not cancel when the client goes back", async () => {
    listMock.mockResolvedValue([debit]);
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);
    await openConfirmation();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(cancelMock).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Cancelar el débito automático?")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancelar débito" })).toBeDefined();
  });

  it("keeps the message short when no end date is known", async () => {
    listMock.mockResolvedValue([debit]);
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil={null} />);

    await openConfirmation();

    expect(screen.getByText("Lo que ya pagaste sigue vigente.")).toBeDefined();
  });

  it("cancels after confirming, refreshes debits and subscriptions and closes the confirmation", async () => {
    listMock.mockResolvedValueOnce([debit]).mockResolvedValue([cancelled]);
    cancelMock.mockResolvedValue(cancelled);
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);
    await openConfirmation();

    await userEvent.click(screen.getByRole("button", { name: SUCCESS_CANCEL_BUTTON }));

    expect(cancelMock).toHaveBeenCalledWith("debit-1");
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain(SUCCESS_TITLE);
    expect(status.textContent).toContain("Lo que ya pagaste sigue vigente hasta el 18/10/2026.");
    expect(screen.getAllByText(SUCCESS_TITLE)).toHaveLength(2);
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(screen.queryByText("¿Cancelar el débito automático?")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("disables the confirm button while the cancellation is in flight and sends one request", async () => {
    listMock.mockResolvedValue([debit]);
    cancelMock.mockReturnValue(new Promise(() => undefined));
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);
    await openConfirmation();

    await userEvent.dblClick(screen.getByRole("button", { name: SUCCESS_CANCEL_BUTTON }));

    expect(screen.getByRole("button", { name: "Cancelando…" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Volver" })).toHaveProperty("disabled", true);
    expect(cancelMock).toHaveBeenCalledTimes(1);
  });

  it("shows a recoverable error when Mercado Pago fails and keeps the debit and the confirmation", async () => {
    listMock.mockResolvedValue([debit]);
    cancelMock.mockRejectedValue(
      new ApiError({ statusCode: 502, code: "PAYMENT_PROVIDER_ERROR", message: "Mercado Pago no responde." }),
    );
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);
    await openConfirmation();

    await userEvent.click(screen.getByRole("button", { name: SUCCESS_CANCEL_BUTTON }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No pudimos cancelar el débito en Mercado Pago. Sigue activo: probá de nuevo en unos minutos.",
    );
    expect(screen.getByText(TITLE)).toBeDefined();
    expect(screen.getByText("¿Cancelar el débito automático?")).toBeDefined();
    expect(screen.getByRole("button", { name: SUCCESS_CANCEL_BUTTON })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("status")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows other API errors inline", async () => {
    listMock.mockResolvedValue([debit]);
    cancelMock.mockRejectedValue(
      new ApiError({ statusCode: 404, code: "AUTO_DEBIT_NOT_FOUND", message: "El débito automático no existe." }),
    );
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);
    await openConfirmation();

    await userEvent.click(screen.getByRole("button", { name: SUCCESS_CANCEL_BUTTON }));

    expect((await screen.findByRole("alert")).textContent).toContain("El débito automático no existe.");
  });

  it("closes the confirmation when the client goes back after an error", async () => {
    listMock.mockResolvedValue([debit]);
    cancelMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithSnackbar(<AutoDebitLine service="performance" paidUntil="2026-10-18" />);
    await openConfirmation();
    await userEvent.click(screen.getByRole("button", { name: SUCCESS_CANCEL_BUTTON }));
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.queryByText("¿Cancelar el débito automático?")).toBeNull();
  });
});
