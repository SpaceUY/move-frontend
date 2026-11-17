import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithSnackbar } from "@/test/render-with-snackbar";

import type { SettingsValues } from "@/lib/api/types";

vi.mock("./update-settings", () => ({ updateSettings: vi.fn() }));

import { SettingsForm } from "./settings-form";
import { updateSettings } from "./update-settings";

const updateSettingsMock = vi.mocked(updateSettings);

const initialValues: SettingsValues = {
  cancelLimitHours: 2,
  bookingWindowDays: 14,
  pendingPaymentMinutes: 15,
  expiringSoonDays: 7,
  noAttendanceDays: 7,
  prolongedInactivityDays: 30,
  frequencyDropRatio: 0.5,
  renewalGraceDays: 30,
  offlinePriceRehabEvaluation: 1800,
  offlinePriceRehabFollowup: null,
  offlinePriceRecoverySession: null,
  offlinePricePerformanceClass: 700,
  offlineUnpaidLimit: 2,
  offlineDiscountEnabled: false,
  offlineDiscountPercent: null,
  transferEnabled: false,
  transferDetails: null,
};

const hoursField = () => screen.getByLabelText("Límite para cancelar (horas)");
const ratioField = () => screen.getByLabelText("Ratio de baja de frecuencia") as HTMLInputElement;
const prolongedField = () => screen.getByLabelText("Días de inactividad prolongada (días)");

async function typeInto(field: HTMLElement, value: string) {
  const user = userEvent.setup();
  await user.clear(field);
  await user.type(field, value);
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
}

async function changeHoursTo(value: string) {
  const user = userEvent.setup();
  await user.clear(hoursField());
  await user.type(hoursField(), value);
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
}

describe("SettingsForm", () => {
  beforeEach(() => {
    updateSettingsMock.mockReset();
  });

  it("shows every setting with its current value", () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    expect((hoursField() as HTMLInputElement).value).toBe("2");
    expect(
      (screen.getByLabelText("Reservas con anticipación (días)") as HTMLInputElement).value,
    ).toBe("14");
    expect(
      (screen.getByLabelText("Tiempo para pagar una reserva (minutos)") as HTMLInputElement)
        .value,
    ).toBe("15");
  });

  it("sends only what changed and confirms the save", async () => {
    updateSettingsMock.mockResolvedValue({
      ok: true,
      values: { ...initialValues, cancelLimitHours: 4 },
    });
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    await changeHoursTo("4");

    expect(updateSettingsMock).toHaveBeenCalledWith({ cancelLimitHours: 4 });
    const saved = await screen.findByRole("status");
    expect(saved.textContent).toContain("Cambios guardados.");
    expect(saved.querySelector("[data-snackbar-title]")).not.toBeNull();
    expect((hoursField() as HTMLInputElement).value).toBe("4");
  });

  it("shows and saves the renewal grace days", async () => {
    updateSettingsMock.mockResolvedValue({
      ok: true,
      values: { ...initialValues, renewalGraceDays: 45 },
    });
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    const field = screen.getByLabelText("Gracia para renovar (días)") as HTMLInputElement;
    expect(field.value).toBe("30");
    await typeInto(field, "45");

    expect(updateSettingsMock).toHaveBeenCalledWith({ renewalGraceDays: 45 });
  });

  it("does not call the API when nothing changed", async () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(updateSettingsMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("No hay cambios para guardar.");
  });

  it.each(["", "abc", "2.5", "-1"])("rejects %j before calling the API", async (value) => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    const user = userEvent.setup();
    await user.clear(hoursField());
    if (value) await user.type(hoursField(), value);
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.getByText("Ingresá un número entero.")).toBeDefined();
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("shows the API's error under the field that is wrong", async () => {
    updateSettingsMock.mockResolvedValue({
      ok: false,
      fieldErrors: { cancelLimitHours: "Tiene que ser un número entero entre 0 y 72." },
      message: null,
    });
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    await changeHoursTo("999");

    expect(await screen.findByText("Tiene que ser un número entero entre 0 y 72.")).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getAllByRole("alert").some((el) => el.textContent?.includes("Revisá 1 campo"))).toBe(true);
  });

  it("shows a general message when the API is unreachable, and keeps what was typed", async () => {
    updateSettingsMock.mockResolvedValue({
      ok: false,
      fieldErrors: {},
      message: "No pudimos guardar los cambios. Probá de nuevo en unos minutos.",
    });
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    await changeHoursTo("4");

    expect((await screen.findByRole("alert")).textContent).toContain("No pudimos guardar");
    expect((hoursField() as HTMLInputElement).value).toBe("4");
  });

  it("groups the settings into bookings and follow-up", () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    const bookings = screen.getByRole("group", { name: "Reservas y pagos" });
    const followup = screen.getByRole("group", { name: "Seguimiento" });
    expect(within(bookings).getByLabelText("Límite para cancelar (horas)")).toBeDefined();
    expect(within(followup).getByLabelText('Días para "por vencer" (días)')).toBeDefined();
    expect(within(followup).getByLabelText("Días sin asistir (días)")).toBeDefined();
    expect(within(followup).getByLabelText("Días de inactividad prolongada (días)")).toBeDefined();
    expect(within(followup).getByLabelText("Ratio de baja de frecuencia")).toBeDefined();
  });

  it("shows the ratio with a comma", () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    expect(ratioField().value).toBe("0,5");
    expect(ratioField().getAttribute("inputmode")).toBe("decimal");
  });

  it.each(["0,3", "0.3"])("accepts a decimal ratio written as %s", async (text) => {
    updateSettingsMock.mockResolvedValue({ ok: true, values: { ...initialValues, frequencyDropRatio: 0.3 } });
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    await typeInto(ratioField(), text);

    expect(updateSettingsMock).toHaveBeenCalledWith({ frequencyDropRatio: 0.3 });
  });

  it.each(["", "abc", "-0,5", "0,5,1"])("rejects the ratio %j before calling the API", async (text) => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    const user = userEvent.setup();
    await user.clear(ratioField());
    if (text) await user.type(ratioField(), text);
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.getByText("Ingresá un número (ej. 0,5).")).toBeDefined();
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("blocks a prolonged inactivity value that is not above the days without attendance", async () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    await typeInto(prolongedField(), "7");

    expect(screen.getByText("Tiene que ser mayor que los días sin asistir.")).toBeDefined();
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("sends only the modified fields", async () => {
    updateSettingsMock.mockResolvedValue({ ok: true, values: { ...initialValues, noAttendanceDays: 10 } });
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    await typeInto(screen.getByLabelText("Días sin asistir (días)"), "10");

    expect(updateSettingsMock).toHaveBeenCalledWith({ noAttendanceDays: 10 });
  });

  it("shows an unsaved-changes indicator while editing, and Descartar reverts it", async () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);
    const user = userEvent.setup();

    expect(screen.queryByText("Tenés cambios sin guardar")).toBeNull();

    await user.clear(hoursField());
    await user.type(hoursField(), "4");

    expect(screen.getByText("Tenés cambios sin guardar")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.queryByText("Tenés cambios sin guardar")).toBeNull();
    expect((hoursField() as HTMLInputElement).value).toBe("2");
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("gives each section its own card, named by its title", () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    for (const title of [
      "Reservas y pagos",
      "Seguimiento",
      "Precios para reservar por fuera",
      "Pagos en efectivo o transferencia",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeDefined();
      expect(screen.getByRole("group", { name: title })).toBeDefined();
    }
  });

  it("lays the four prices out two by two and the other sections in three columns", () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    const gridOf = (title: string) =>
      screen.getByRole("group", { name: title }).querySelector("div.grid") as HTMLElement;

    expect(gridOf("Precios para reservar por fuera").className).not.toContain("lg:grid-cols-3");
    expect(gridOf("Seguimiento").className).toContain("lg:grid-cols-3");
  });

  it("marks as modified only the section that has unsaved edits", async () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);
    const user = userEvent.setup();
    const bookings = () => screen.getByRole("group", { name: "Reservas y pagos" });
    const followup = () => screen.getByRole("group", { name: "Seguimiento" });

    expect(screen.queryByText("Modificado")).toBeNull();

    await user.clear(hoursField());
    await user.type(hoursField(), "4");

    expect(within(bookings()).getByText("Modificado")).toBeDefined();
    expect(within(followup()).queryByText("Modificado")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.queryByText("Modificado")).toBeNull();
  });

  it("drops the modified mark once the changes are saved", async () => {
    updateSettingsMock.mockResolvedValue({
      ok: true,
      values: { ...initialValues, cancelLimitHours: 4 },
    });
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    await changeHoursTo("4");

    await screen.findByText("Cambios guardados.");
    expect(screen.queryByText("Modificado")).toBeNull();
  });

  it("shows the API range error under the field", async () => {
    updateSettingsMock.mockResolvedValue({
      ok: false,
      fieldErrors: { frequencyDropRatio: "Tiene que estar entre 0 y 1." },
      message: null,
    });
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    await typeInto(ratioField(), "5");

    expect(await screen.findByText("Tiene que estar entre 0 y 1.")).toBeDefined();
  });

  it("warns on beforeunload if dirty", async () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);
    const user = userEvent.setup();

    // Make the form dirty
    await user.clear(hoursField());
    await user.type(hoursField(), "4");

    // Simulate a beforeunload event (e.g., browser refresh, tab close, back button)
    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    window.dispatchEvent(event);

    // jsdom's generic Event (not a real BeforeUnloadEvent) always reports its legacy
    // boolean returnValue as false once preventDefault() is called, regardless of what
    // string the handler assigns — preventDefault() having fired is what the browser acts on.
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(event.returnValue).toBeFalsy();
  });

  it("does not warn on beforeunload if not dirty", () => {
    renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

    // Simulate a beforeunload event without making the form dirty
    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    window.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  describe("offline payments", () => {
    const limitField = () => screen.getByLabelText("Máximo de cosas sin pagar") as HTMLInputElement;
    const transferSwitch = () => screen.getByRole("switch", { name: "Aceptar transferencias" });
    const discountSwitch = () => screen.getByRole("switch", { name: "Aplicar descuento" });
    const detailsField = () => screen.queryByLabelText("Datos para transferir") as HTMLTextAreaElement | null;
    const percentField = () => screen.queryByLabelText("Descuento (%)") as HTMLInputElement | null;
    const save = () => userEvent.setup().click(screen.getByRole("button", { name: "Guardar cambios" }));

    it("shows the section with the cap, and the dependent fields hidden while their switch is off", () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      const group = screen.getByRole("group", { name: "Pagos en efectivo o transferencia" });
      expect(within(group).getByText("Vale para lo que compra el cliente y para lo que reserva Staff por fuera.")).toBeDefined();
      expect(limitField().value).toBe("2");
      expect(discountSwitch().getAttribute("aria-checked")).toBe("false");
      expect(transferSwitch().getAttribute("aria-checked")).toBe("false");
      expect(percentField()).toBeNull();
      expect(detailsField()).toBeNull();
    });

    it("shows the details field as a four-row text area when transfers are turned on", async () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await userEvent.setup().click(transferSwitch());

      expect(detailsField()?.tagName).toBe("TEXTAREA");
      expect(detailsField()?.getAttribute("rows")).toBe("4");
      expect(
        screen.getByText(
          "El cliente los ve tal cual al elegir Transferencia. Poné la cuenta y a qué WhatsApp mandar el comprobante.",
        ),
      ).toBeDefined();
    });

    it("groups each switch with its own field under a group label, as in the mockup", async () => {
      renderWithSnackbar(<SettingsForm initialValues={{ ...initialValues, offlineDiscountEnabled: true, offlineDiscountPercent: 10, transferEnabled: true, transferDetails: "BROU" }} />);

      const discount = screen.getByRole("group", { name: "Descuento" });
      expect(within(discount).getByRole("switch", { name: "Aplicar descuento" })).toBeDefined();
      expect(within(discount).getByLabelText("Descuento (%)")).toBeDefined();
      expect(within(discount).queryByLabelText("Máximo de cosas sin pagar")).toBeNull();

      const transfers = screen.getByRole("group", { name: "Transferencias" });
      expect(within(transfers).getByRole("switch", { name: "Aceptar transferencias" })).toBeDefined();
      expect(within(transfers).getByLabelText("Datos para transferir")).toBeDefined();
    });

    it("puts the switch above its field", () => {
      renderWithSnackbar(<SettingsForm initialValues={{ ...initialValues, offlineDiscountEnabled: true, offlineDiscountPercent: 10 }} />);

      const position = discountSwitch().compareDocumentPosition(percentField() as HTMLInputElement);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("gives the transfer block the full width and the discount block one column", () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      expect(screen.getByRole("group", { name: "Transferencias" }).className).toContain("col-span-full");
      expect(screen.getByRole("group", { name: "Descuento" }).className).not.toContain("col-span");
    });

    it("lays the section out in two columns, so the discount block is not squeezed", () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      const grid = screen.getByRole("group", { name: "Descuento" }).parentElement as HTMLElement;
      expect(grid.className).toContain("sm:grid-cols-2");
      expect(grid.className).not.toContain("lg:grid-cols-3");
    });

    it("shows the percentage when the discount is turned on", async () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await userEvent.setup().click(discountSwitch());

      expect(percentField()).not.toBeNull();
      expect(screen.getByText("Porcentaje entero. 10 = 10%.")).toBeDefined();
    });

    it("marks the details and does not call the API when transfers are on and the text is empty", async () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await userEvent.setup().click(transferSwitch());
      await save();

      expect(screen.getByText("Escribí los datos para transferir.")).toBeDefined();
      expect(detailsField()?.getAttribute("aria-invalid")).toBe("true");
      expect(updateSettingsMock).not.toHaveBeenCalled();
    });

    it("marks the percentage when the discount is on and it is empty", async () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await userEvent.setup().click(discountSwitch());
      await save();

      expect(screen.getByText("Poné el porcentaje de descuento.")).toBeDefined();
      expect(updateSettingsMock).not.toHaveBeenCalled();
    });

    it("sends the switch and the text together when both changed", async () => {
      updateSettingsMock.mockResolvedValue({
        ok: true,
        values: { ...initialValues, transferEnabled: true, transferDetails: "BROU 0001" },
      });
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);
      const user = userEvent.setup();

      await user.click(transferSwitch());
      await user.type(detailsField() as HTMLTextAreaElement, "  BROU 0001 ");
      await save();

      expect(updateSettingsMock).toHaveBeenCalledWith({ transferEnabled: true, transferDetails: "BROU 0001" });
    });

    it("sends only the switch when the saved text did not change", async () => {
      const withDetails = { ...initialValues, transferEnabled: false, transferDetails: "BROU 0001" };
      updateSettingsMock.mockResolvedValue({ ok: true, values: { ...withDetails, transferEnabled: true } });
      renderWithSnackbar(<SettingsForm initialValues={withDetails} />);

      await userEvent.setup().click(transferSwitch());
      expect(detailsField()?.value).toBe("BROU 0001");
      await save();

      expect(updateSettingsMock).toHaveBeenCalledWith({ transferEnabled: true });
    });

    it("keeps the text when the switch is turned off and on again", async () => {
      const withDetails = { ...initialValues, transferEnabled: true, transferDetails: "BROU 0001" };
      renderWithSnackbar(<SettingsForm initialValues={withDetails} />);
      const user = userEvent.setup();

      await user.click(transferSwitch());
      expect(detailsField()).toBeNull();
      await user.click(transferSwitch());

      expect(detailsField()?.value).toBe("BROU 0001");
    });

    it("turns the discount off without sending the saved percentage", async () => {
      const withDiscount = { ...initialValues, offlineDiscountEnabled: true, offlineDiscountPercent: 10 };
      updateSettingsMock.mockResolvedValue({ ok: true, values: { ...withDiscount, offlineDiscountEnabled: false } });
      renderWithSnackbar(<SettingsForm initialValues={withDiscount} />);
      const user = userEvent.setup();

      expect(percentField()?.value).toBe("10");
      await user.click(discountSwitch());
      await save();

      expect(updateSettingsMock).toHaveBeenCalledWith({ offlineDiscountEnabled: false });
    });

    it("sends a new cap", async () => {
      updateSettingsMock.mockResolvedValue({ ok: true, values: { ...initialValues, offlineUnpaidLimit: 3 } });
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await typeInto(limitField(), "3");

      expect(updateSettingsMock).toHaveBeenCalledWith({ offlineUnpaidLimit: 3 });
    });

    it("shows a saved text with dots as it was saved", () => {
      const withDetails = { ...initialValues, transferEnabled: true, transferDetails: "MOVE S.A." };
      renderWithSnackbar(<SettingsForm initialValues={withDetails} />);

      expect(detailsField()?.value).toBe("MOVE S.A.");
    });

    it("sends the percentage as a number when the discount is turned on", async () => {
      updateSettingsMock.mockResolvedValue({
        ok: true,
        values: { ...initialValues, offlineDiscountEnabled: true, offlineDiscountPercent: 15 },
      });
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);
      const user = userEvent.setup();

      await user.click(discountSwitch());
      await user.type(percentField() as HTMLInputElement, "15");
      await save();

      expect(updateSettingsMock).toHaveBeenCalledWith({ offlineDiscountEnabled: true, offlineDiscountPercent: 15 });
    });

    it("marks a percentage above 100 and does not call the API", async () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await userEvent.setup().click(discountSwitch());
      await typeInto(percentField() as HTMLInputElement, "150");

      expect(screen.getByText("Tiene que ser un número entero entre 1 y 100, o vacío.")).toBeDefined();
      expect(percentField()?.getAttribute("aria-invalid")).toBe("true");
      expect(updateSettingsMock).not.toHaveBeenCalled();
    });

    it("marks a percentage of 0 and does not call the API", async () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await userEvent.setup().click(discountSwitch());
      await typeInto(percentField() as HTMLInputElement, "0");

      expect(screen.getByText("Tiene que ser un número entero entre 1 y 100, o vacío.")).toBeDefined();
      expect(updateSettingsMock).not.toHaveBeenCalled();
    });

    it("leaves a wrong percentage out of the request when the discount is turned off", async () => {
      updateSettingsMock.mockResolvedValue({ ok: true, values: initialValues });
      renderWithSnackbar(<SettingsForm initialValues={{ ...initialValues, offlineDiscountEnabled: true, offlineDiscountPercent: 10 }} />);
      const user = userEvent.setup();

      await user.clear(percentField() as HTMLInputElement);
      await user.type(percentField() as HTMLInputElement, "150");
      await user.click(discountSwitch());
      await save();

      expect(updateSettingsMock).toHaveBeenCalledWith({ offlineDiscountEnabled: false });
    });

    it("marks a cap above 20 and does not call the API", async () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await typeInto(limitField(), "25");

      expect(screen.getByText("Tiene que ser un número entero entre 1 y 20.")).toBeDefined();
      expect(limitField().getAttribute("aria-invalid")).toBe("true");
      expect(updateSettingsMock).not.toHaveBeenCalled();
    });

    it("marks a cap of 0 and does not call the API", async () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await typeInto(limitField(), "0");

      expect(screen.getByText("Tiene que ser un número entero entre 1 y 20.")).toBeDefined();
      expect(updateSettingsMock).not.toHaveBeenCalled();
    });

    it("saves another setting while a hidden transfer text is too long", async () => {
      updateSettingsMock.mockResolvedValue({ ok: true, values: { ...initialValues, offlineUnpaidLimit: 3 } });
      renderWithSnackbar(<SettingsForm initialValues={{ ...initialValues, transferEnabled: true, transferDetails: "BROU" }} />);
      const user = userEvent.setup();

      fireEvent.change(detailsField() as HTMLTextAreaElement, { target: { value: "a".repeat(501) } });
      await user.click(transferSwitch());
      await typeInto(limitField(), "3");

      expect(updateSettingsMock).toHaveBeenCalledWith({ offlineUnpaidLimit: 3, transferEnabled: false });
    });

    it("shows the API's error under the details field", async () => {
      updateSettingsMock.mockResolvedValue({
        ok: false,
        fieldErrors: { transferDetails: "Tiene que ser un texto de hasta 500 caracteres, o vacío." },
        message: null,
      });
      const withDetails = { ...initialValues, transferEnabled: true, transferDetails: "BROU" };
      renderWithSnackbar(<SettingsForm initialValues={withDetails} />);
      const user = userEvent.setup();

      await user.type(detailsField() as HTMLTextAreaElement, " 2");
      await save();

      expect(await screen.findByText("Tiene que ser un texto de hasta 500 caracteres, o vacío.")).toBeDefined();
    });
  });

  describe("offline prices", () => {
    const evaluationField = () => screen.getByLabelText("Evaluación de Rehab") as HTMLInputElement;
    const followupField = () => screen.getByLabelText("Seguimiento de Rehab") as HTMLInputElement;
    const recoveryField = () => screen.getByLabelText("Sesión suelta de Recovery") as HTMLInputElement;
    const performanceField = () => screen.getByLabelText("Clase suelta de Performance") as HTMLInputElement;

    it("shows the four prices in their own group with the help text, empty when there is none", () => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      const group = screen.getByRole("group", { name: "Precios para reservar por fuera" });
      expect(
        within(group).getByText(
          "Es el precio que se cobra cuando Staff reserva un turno por fuera. Vacío = sin precio. No cambia lo que se cobra con Mercado Pago.",
        ),
      ).toBeDefined();
      expect(within(group).getByLabelText("Evaluación de Rehab")).toBeDefined();
      expect(evaluationField().value).toBe("1800");
      expect(followupField().value).toBe("");
      expect(recoveryField().value).toBe("");
      expect(performanceField().value).toBe("700");
      expect(evaluationField().getAttribute("inputmode")).toBe("decimal");
    });

    it("sends a new price and keeps the others out of the request", async () => {
      updateSettingsMock.mockResolvedValue({ ok: true, values: { ...initialValues, offlinePriceRehabFollowup: 1200.5 } });
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await typeInto(followupField(), "1.200,50");

      expect(updateSettingsMock).toHaveBeenCalledWith({ offlinePriceRehabFollowup: 1200.5 });
      expect(followupField().value).toBe("1200,5");
    });

    it("sends null when a price is cleared", async () => {
      updateSettingsMock.mockResolvedValue({ ok: true, values: { ...initialValues, offlinePriceRehabEvaluation: null } });
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      const user = userEvent.setup();
      await user.clear(evaluationField());
      await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

      expect(updateSettingsMock).toHaveBeenCalledWith({ offlinePriceRehabEvaluation: null });
      expect(evaluationField().value).toBe("");
    });

    it("leaves the prices that did not change out of the request", async () => {
      updateSettingsMock.mockResolvedValue({ ok: true, values: { ...initialValues, cancelLimitHours: 3 } });
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await typeInto(hoursField(), "3");

      expect(updateSettingsMock).toHaveBeenCalledWith({ cancelLimitHours: 3 });
    });

    it.each([
      ["abc", "Ingresá un monto válido."],
      ["-5", "Ingresá un monto válido."],
      ["10,123", "Máximo 2 decimales."],
      ["100001", "El monto máximo es $ 100.000."],
    ])("rejects the price %j before calling the API", async (text, message) => {
      renderWithSnackbar(<SettingsForm initialValues={initialValues} />);

      await typeInto(recoveryField(), text);

      expect(screen.getByText(message)).toBeDefined();
      expect(updateSettingsMock).not.toHaveBeenCalled();
    });
  });
});
