import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { OfflineChargeDetailDto, OfflineChargeDto, ReceiptUploadDto } from "@/lib/api/types";

import { getReceiptUpload, recordOfflinePayment } from "./offline-charges-api";
import { RecordPaymentDialog } from "./record-payment-dialog";

const showSnackbar = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/snackbar", () => ({ useSnackbar: () => ({ showSnackbar }) }));
vi.mock("@/features/bookings/slots", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/bookings/slots")>()),
  todayBusinessDate: () => "2026-11-02",
}));
vi.mock("./offline-charges-api", () => ({ getReceiptUpload: vi.fn(), recordOfflinePayment: vi.fn() }));

const getReceiptUploadMock = vi.mocked(getReceiptUpload);
const recordMock = vi.mocked(recordOfflinePayment);

const CHARGE: OfflineChargeDto = {
  id: "ch1",
  kind: "booking",
  planStartsOn: null,
  paysWith: null,
  client: { id: "c1", name: "Sofía Pérez", email: "sofia@move.test" },
  bookingId: "b1",
  service: "recovery",
  itemName: "Sesión de Recovery",
  booking: { startsAt: "2026-11-06T13:00:00.000Z", status: "confirmed" },
  slotStarted: false,
  status: "pending",
  paymentMethod: "cash",
  amount: 900,
  currency: "UYU",
  createdAt: "2026-11-02T12:00:00.000Z",
  bookedBy: { id: "s1", name: "Staff" },
  closedAt: null,
  closedBy: null,
  closeReason: null,
  needsAttention: false,
  attentionReason: null,
  attentionNote: null,
  payment: null,
};
const DETAIL: OfflineChargeDetailDto = { ...CHARGE, status: "approved", payments: [] };
const UPLOAD_ON: ReceiptUploadDto = { available: true, maxBytes: 5242880, allowedTypes: [] };

const PDF = new File(["x"], "comprobante.pdf", { type: "application/pdf" });

function apiError(statusCode: number, code: string, message = "Mensaje del back.") {
  return new ApiError({ statusCode, code, message });
}

function renderDialog(charge: OfflineChargeDto = CHARGE) {
  const handlers = { onRecorded: vi.fn(), onStale: vi.fn(), onClose: vi.fn() };
  render(<RecordPaymentDialog charge={charge} {...handlers} />);
  return handlers;
}

function receiptField(): HTMLInputElement {
  return screen.getByLabelText("Comprobante (opcional)") as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  getReceiptUploadMock.mockResolvedValue(UPLOAD_ON);
});

describe("RecordPaymentDialog", () => {
  it("opens prefilled from the charge", async () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Registrar pago · Sofía Pérez" });
    expect(within(dialog).getByText("Recovery · vie 6/11, 10:00")).toBeDefined();
    expect(within(dialog).getByRole("radio", { name: "Efectivo" }).getAttribute("aria-checked")).toBe("true");
    expect(within(dialog).getByRole("radio", { name: "Transferencia" }).getAttribute("aria-checked")).toBe("false");
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("900");
    const date = screen.getByLabelText("Fecha del pago") as HTMLInputElement;
    expect(date.value).toBe("2026-11-02");
    expect(date.max).toBe("2026-11-02");
    expect(screen.getByPlaceholderText("Ej.: transferencia desde la cuenta de la madre")).toBeDefined();
    expect(screen.getByText("Foto o PDF, máximo 1 MB.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Confirmar pago" })).toBeDefined();
    await waitFor(() => expect(receiptField().disabled).toBe(false));
  });

  it("records the payment of the plan from the row of a turn, prefilled with the plan's amount", async () => {
    recordMock.mockResolvedValue({ ...DETAIL, kind: "plan" });
    const turn: OfflineChargeDto = {
      ...CHARGE,
      kind: "plan",
      paysWith: { itemName: "Mensual" },
      amount: 2700,
      service: "performance",
      itemName: "Mensual",
    };
    renderDialog(turn);

    const dialog = screen.getByRole("dialog", { name: "Registrar pago · Sofía Pérez" });
    expect(within(dialog).getByText("Se paga con el plan Mensual")).toBeDefined();
    expect(within(dialog).getByText("Al registrarlo se cierra el plan y todos sus turnos.")).toBeDefined();
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("2700");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar pago" }));

    await waitFor(() => expect(recordMock).toHaveBeenCalledTimes(1));
    expect(recordMock.mock.calls[0][0]).toBe("ch1");
    expect(recordMock.mock.calls[0][1]).toMatchObject({ amount: 2700 });
  });

  it("says the paquete, not the plan, when the turn belongs to a Recovery pack", () => {
    const turn: OfflineChargeDto = {
      ...CHARGE,
      kind: "plan",
      paysWith: { itemName: "Paquete 4 sesiones" },
      amount: 3240,
      service: "recovery",
      itemName: "Paquete 4 sesiones",
    };
    renderDialog(turn);

    const dialog = screen.getByRole("dialog", { name: "Registrar pago · Sofía Pérez" });
    expect(within(dialog).getByText("Se paga con el paquete 4 sesiones")).toBeDefined();
    expect(within(dialog).getByText("Al registrarlo se cierra el paquete y todos sus turnos.")).toBeDefined();
  });

  it("opens empty when the charge has no method or amount yet", async () => {
    renderDialog({ ...CHARGE, paymentMethod: "undecided", amount: null });

    expect(screen.getByRole("radio", { name: "Efectivo" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("radio", { name: "Transferencia" }).getAttribute("aria-checked")).toBe("false");
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("");
    await waitFor(() => expect(receiptField().disabled).toBe(false));
  });

  it("disables the receipt field while the upload check loads and when storage is off", async () => {
    let resolveUpload: (value: ReceiptUploadDto) => void = () => {};
    getReceiptUploadMock.mockReturnValue(new Promise((resolve) => (resolveUpload = resolve)));
    renderDialog();

    expect(receiptField().disabled).toBe(true);
    expect(screen.queryByText("Adjuntar comprobante no está disponible todavía.")).toBeNull();

    resolveUpload({ ...UPLOAD_ON, available: false });

    expect(await screen.findByText("Adjuntar comprobante no está disponible todavía.")).toBeDefined();
    expect(receiptField().disabled).toBe(true);
  });

  it("disables the receipt field when the upload check fails", async () => {
    getReceiptUploadMock.mockRejectedValue(new Error("boom"));
    renderDialog();

    expect(await screen.findByText("Adjuntar comprobante no está disponible todavía.")).toBeDefined();
    expect(receiptField().disabled).toBe(true);
  });

  it("records without a receipt", async () => {
    recordMock.mockResolvedValue(DETAIL);
    const { onRecorded } = renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    expect(recordMock).toHaveBeenCalledWith("ch1", {
      method: "cash",
      amount: 900,
      paidOn: "2026-11-02",
      note: null,
      receipt: null,
    });
    expect(showSnackbar).toHaveBeenCalledWith({ tone: "success", title: "Pago registrado." });
    expect(onRecorded).toHaveBeenCalledWith(DETAIL);
  });

  it("records what was typed, with the receipt", async () => {
    recordMock.mockResolvedValue(DETAIL);
    renderDialog({ ...CHARGE, paymentMethod: "undecided", amount: null });
    const user = userEvent.setup();
    await waitFor(() => expect(receiptField().disabled).toBe(false));

    await user.click(screen.getByRole("radio", { name: "Transferencia" }));
    await user.type(screen.getByLabelText("Monto"), "1.200,50");
    await user.type(screen.getByLabelText("Nota (opcional)"), "De la madre");
    await user.upload(receiptField(), PDF);
    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    expect(recordMock).toHaveBeenCalledWith("ch1", {
      method: "transfer",
      amount: 1200.5,
      paidOn: "2026-11-02",
      note: "De la madre",
      receipt: PDF,
    });
  });

  it("shows the field errors without sending", async () => {
    renderDialog({ ...CHARGE, paymentMethod: "undecided", amount: null });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    expect(screen.getByText("Elegí cómo pagó.")).toBeDefined();
    expect(screen.getByText("Ingresá el monto que pagó.")).toBeDefined();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("rejects a big or foreign file before sending", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderDialog();
    await waitFor(() => expect(receiptField().disabled).toBe(false));

    await user.upload(receiptField(), new File([new Uint8Array(1024 * 1024 + 1)], "grande.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));
    expect(screen.getByText("El comprobante no puede pesar más de 1 MB.")).toBeDefined();

    await user.upload(receiptField(), new File(["x"], "nota.txt", { type: "text/plain" }));
    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));
    expect(
      screen.getByText("El comprobante tiene que ser una foto (JPG, PNG, WEBP o HEIC) o un PDF."),
    ).toBeDefined();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it.each([
    [413, "RECEIPT_TOO_LARGE", "El comprobante no puede pesar más de 1 MB."],
    [415, "RECEIPT_TYPE_NOT_ALLOWED", "El comprobante tiene que ser una foto (JPG, PNG, WEBP o HEIC) o un PDF."],
  ])("puts a %d under the receipt field", async (status, code, copy) => {
    recordMock.mockRejectedValue(apiError(status, code));
    const { onRecorded, onClose } = renderDialog();
    const user = userEvent.setup();
    await waitFor(() => expect(receiptField().disabled).toBe(false));
    await user.type(screen.getByLabelText("Nota (opcional)"), "Algo");
    await user.upload(receiptField(), PDF);

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    expect(await screen.findByText(copy)).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("900");
    expect((screen.getByLabelText("Nota (opcional)") as HTMLTextAreaElement).value).toBe("Algo");
    expect(onRecorded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(showSnackbar).not.toHaveBeenCalled();
  });

  it("puts a future date error under the date", async () => {
    recordMock.mockRejectedValue(apiError(400, "OFFLINE_PAYMENT_DATE_IN_FUTURE"));
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    expect(await screen.findByText("La fecha del pago no puede ser futura.")).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("limits the date to the last 30 days", () => {
    renderDialog();

    const date = screen.getByLabelText("Fecha del pago") as HTMLInputElement;
    expect(date.max).toBe("2026-11-02");
    expect(date.min).toBe("2026-10-03");
  });

  it("shows the date error under the date for OFFLINE_PAYMENT_DATE_TOO_OLD", async () => {
    recordMock.mockRejectedValue(apiError(400, "OFFLINE_PAYMENT_DATE_TOO_OLD"));
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    expect(await screen.findByText("La fecha no puede ser de hace más de 30 días.")).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("closes and reloads when the charge is no longer open", async () => {
    recordMock.mockRejectedValue(apiError(409, "OFFLINE_CHARGE_NOT_OPEN", "Este cobro ya no está abierto."));
    const { onStale, onClose, onRecorded } = renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(showSnackbar).toHaveBeenCalledWith({ tone: "info", title: "Este cobro ya no está abierto." });
    expect(onStale).toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("drops the receipt and explains when storage turned off meanwhile", async () => {
    recordMock.mockRejectedValue(apiError(409, "RECEIPT_UPLOAD_UNAVAILABLE"));
    const { onClose } = renderDialog();
    const user = userEvent.setup();
    await waitFor(() => expect(receiptField().disabled).toBe(false));
    await user.upload(receiptField(), PDF);

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    expect(await screen.findByText("Adjuntar comprobante no está disponible todavía.")).toBeDefined();
    expect(receiptField().disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(showSnackbar).toHaveBeenCalledWith({ tone: "info", title: "Mensaje del back." });
  });

  it("uses the unavailable copy for the snackbar when the back sends no message", async () => {
    recordMock.mockRejectedValue(apiError(409, "RECEIPT_UPLOAD_UNAVAILABLE", ""));
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    await waitFor(() =>
      expect(showSnackbar).toHaveBeenCalledWith({
        tone: "info",
        title: "Adjuntar comprobante no está disponible todavía.",
      }),
    );
  });

  it.each([
    [413, "El comprobante no puede pesar más de 1 MB."],
    [415, "El comprobante tiene que ser una foto (JPG, PNG, WEBP o HEIC) o un PDF."],
  ])("maps a %d by status when a proxy answered without JSON", async (status, copy) => {
    recordMock.mockRejectedValue(apiError(status, "UNKNOWN", "Request Entity Too Large"));
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    expect(await screen.findByText(copy)).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(showSnackbar).not.toHaveBeenCalled();
  });

  it("shows the storage error and keeps the dialog open", async () => {
    recordMock.mockRejectedValue(apiError(502, "FILE_STORAGE_ERROR", "No pudimos guardar el comprobante."));
    const { onClose, onRecorded } = renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    await waitFor(() =>
      expect(showSnackbar).toHaveBeenCalledWith({ tone: "danger", title: "No pudimos guardar el comprobante." }),
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("falls back to a generic message on an unknown failure", async () => {
    recordMock.mockRejectedValue(new Error("network"));
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    await waitFor(() =>
      expect(showSnackbar).toHaveBeenCalledWith({
        tone: "danger",
        title: "No pudimos registrar el pago. Probá de nuevo.",
      }),
    );
  });

  it("records once on a double click", async () => {
    recordMock.mockResolvedValue(DETAIL);
    renderDialog();
    const user = userEvent.setup();

    await user.dblClick(screen.getByRole("button", { name: "Confirmar pago" }));

    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("closes with Cancelar", async () => {
    const { onClose } = renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalled();
  });
});
