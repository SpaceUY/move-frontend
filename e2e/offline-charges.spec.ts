import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page, type Response } from "@playwright/test";

import type { OfflineChargeListDto } from "@/lib/api/types";

import {
  businessDateFromToday,
  openSlotId,
  SEEDED_CHARGE_IDS,
  STAFF_BOOKING_CLIENT_IDS as IDS,
  TINY_PNG,
} from "./support/offline-charges-fixtures";
import type { StaffBookingScenario } from "./support/scenarios";
import { setOwner, setScenario } from "./support/use-scenario";

const TO_COLLECT = "/staff/payments?view=to-collect";
const RECEIPT_FIELD = "Comprobante (opcional)";
const RECEIPT_UNAVAILABLE = "Adjuntar comprobante no está disponible todavía.";

// Each test is its own staff member, so what one records never shows up in another running in parallel.
async function actAsStaff(page: Page, baseURL: string, scenario: StaffBookingScenario = "staff-booking") {
  await setScenario(page.context(), baseURL, scenario);
  await setOwner(page.context(), baseURL, randomUUID());
}

function chargeHref(id: string): string {
  return `/staff/payments/offline-charges/${id}`;
}

function rosterHref(service: "rehab" | "recovery", dayOffset: number): string {
  return `/staff/schedule/${openSlotId(service, businessDateFromToday(dayOffset))}`;
}

/** The roster's lookup of the open charges of its bookings, which lands after the roster itself. */
function owedLookup(page: Page): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/staff/offline-charges" && url.searchParams.has("bookingIds");
  });
}

/** The rows of "Por cobrar": each one has its "Marcar como pagado". */
function toCollectRows(page: Page): Locator {
  return page.locator("li").filter({ has: page.getByRole("button", { name: "Marcar como pagado" }) });
}

function paymentDialog(page: Page, clientName: string): Locator {
  return page.getByRole("dialog", { name: `Registrar pago · ${clientName}` });
}

function paymentPosts(page: Page): string[] {
  const posted: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/payment")) {
      posted.push(request.headers()["content-type"] ?? "");
    }
  });
  return posted;
}

// The detail's "Marcar como pagado" with the values the charge already has (Sofía: cash, $ 900).
async function payFromDetail(page: Page, chargeId: string, clientName: string, receipt = false): Promise<void> {
  await page.goto(chargeHref(chargeId));
  await expect(page.getByRole("heading", { level: 1, name: `Cobro por fuera · ${clientName}` })).toBeVisible();
  await page.getByRole("button", { name: "Marcar como pagado" }).click();
  const dialog = paymentDialog(page, clientName);
  if (receipt) {
    const field = dialog.getByLabel(RECEIPT_FIELD);
    await expect(field).toBeEnabled();
    await field.setInputFiles({ name: "comprobante.png", mimeType: "image/png", buffer: TINY_PNG });
  }
  await dialog.getByRole("button", { name: "Confirmar pago" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pago registrado." })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "Pagado" })).toBeVisible();
}

async function cancelFromRoster(page: Page, clientName: string): Promise<void> {
  const row = page.getByRole("row").filter({ hasText: clientName });
  await row.getByRole("button", { name: "Cancelar reserva" }).click();
  const dialog = page.getByRole("dialog", { name: `¿Cancelar la reserva de ${clientName}?` });
  await expect(
    dialog.getByText(
      "Se cobra por fuera: si no pagó, el cobro se cierra solo; si ya pagó, va a quedar en Pagos para revisar.",
    ),
  ).toBeVisible();
  await dialog.getByLabel("Motivo").fill("Avisó que no viene");
  await dialog.getByRole("button", { name: "Cancelar reserva" }).click();
}

test.describe("Offline charges in Pagos", () => {
  test("lists what is owed with the past slot first", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!);
    await page.goto("/staff/payments");

    await page.getByRole("group", { name: "Vista de pagos" }).getByRole("link", { name: "Por cobrar · 4" }).click();

    await expect(page).toHaveURL(/\/staff\/payments\?view=to-collect$/);
    await expect(page.getByRole("link", { name: "Por cobrar · 4" })).toHaveAttribute("aria-pressed", "true");
    const rows = toCollectRows(page);
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText("Juan Silva");
    await expect(rows.first()).toContainText("turno ya pasó");
    await expect(rows.first()).toContainText("A definir");
    // Each fact has its own column, so the method and the amount are checked apart.
    const sofia = rows.filter({ hasText: "Sofía Pérez" });
    await expect(sofia).toContainText("Efectivo");
    await expect(sofia).toContainText("$ 900");
    await expect(sofia).not.toContainText("turno ya pasó");
  });

  test("records a payment with a receipt from Por cobrar", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!);
    const posted = paymentPosts(page);
    await page.goto(TO_COLLECT);

    await toCollectRows(page).filter({ hasText: "Sofía Pérez" }).getByRole("button", { name: "Marcar como pagado" }).click();
    const dialog = paymentDialog(page, "Sofía Pérez");
    await expect(dialog.getByRole("radio", { name: "Efectivo" })).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByLabel("Monto")).toHaveValue("900");
    await expect(dialog.getByLabel("Fecha del pago")).toHaveValue(businessDateFromToday(0));
    await expect(dialog.getByText("Foto o PDF, máximo 1 MB.")).toBeVisible();
    const field = dialog.getByLabel(RECEIPT_FIELD);
    await expect(field).toBeEnabled();
    await field.setInputFiles({ name: "comprobante.png", mimeType: "image/png", buffer: TINY_PNG });
    await dialog.getByLabel("Nota (opcional)").fill("Pagó en recepción");
    await dialog.getByRole("button", { name: "Confirmar pago" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Pago registrado." })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(toCollectRows(page).filter({ hasText: "Sofía Pérez" })).toHaveCount(0);
    await expect(toCollectRows(page)).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Por cobrar · 3" })).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatch(/^multipart\/form-data/);
  });

  test("rejects a receipt over 1 MB before sending", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!);
    const posted = paymentPosts(page);
    await page.goto(TO_COLLECT);

    await toCollectRows(page).filter({ hasText: "Sofía Pérez" }).getByRole("button", { name: "Marcar como pagado" }).click();
    const dialog = paymentDialog(page, "Sofía Pérez");
    const field = dialog.getByLabel(RECEIPT_FIELD);
    await expect(field).toBeEnabled();
    await field.setInputFiles({
      name: "comprobante-grande.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(1024 * 1024 + 1),
    });
    await dialog.getByRole("button", { name: "Confirmar pago" }).click();

    await expect(dialog.getByText("El comprobante no puede pesar más de 1 MB.")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Monto")).toHaveValue("900");
    expect(posted).toHaveLength(0);
  });

  test("records without a receipt when storage is off", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!, "staff-booking-no-storage");
    const posted = paymentPosts(page);
    await page.goto(TO_COLLECT);

    await toCollectRows(page).filter({ hasText: "Sofía Pérez" }).getByRole("button", { name: "Marcar como pagado" }).click();
    const dialog = paymentDialog(page, "Sofía Pérez");
    await expect(dialog.getByText(RECEIPT_UNAVAILABLE)).toBeVisible();
    await expect(dialog.getByLabel(RECEIPT_FIELD)).toBeDisabled();
    await dialog.getByRole("button", { name: "Confirmar pago" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Pago registrado." })).toBeVisible();
    await expect(toCollectRows(page).filter({ hasText: "Sofía Pérez" })).toHaveCount(0);
    expect(posted).toEqual(["application/json"]);
  });

  test("goes from Falta pagar in attendance to the charge in Pagos, records the payment and the badge is gone back in attendance", async ({
    page,
    baseURL,
  }) => {
    await actAsStaff(page, baseURL!);
    const owedBefore = owedLookup(page);
    await page.goto(rosterHref("rehab", -1));
    expect(((await (await owedBefore).json()) as OfflineChargeListDto).total).toBe(1);
    const row = page.getByRole("row").filter({ hasText: "Juan Silva" });
    await expect(row).toBeVisible();

    await row.getByRole("link", { name: "Falta pagar" }).click();

    await expect(page).toHaveURL(new RegExp(`${chargeHref(SEEDED_CHARGE_IDS.juan)}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Cobro por fuera · Juan Silva" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "Por cobrar" })).toBeVisible();
    await page.getByRole("button", { name: "Marcar como pagado" }).click();
    const dialog = paymentDialog(page, "Juan Silva");
    await dialog.getByRole("radio", { name: "Transferencia" }).click();
    await dialog.getByLabel("Monto").fill("1.800");
    await dialog.getByRole("button", { name: "Confirmar pago" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Pago registrado." })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "Pagado" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "$ 1.800" }).first()).toBeVisible();

    // The roster shows before the owed charges are looked up: wait for that answer, or "no badge" proves nothing.
    const owedAfter = owedLookup(page);
    await page.goto(rosterHref("rehab", -1));
    expect(((await (await owedAfter).json()) as OfflineChargeListDto).total).toBe(0);
    await expect(page.getByRole("row").filter({ hasText: "Juan Silva" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Falta pagar" })).toHaveCount(0);
  });

  test("goes from the record's Falta pagar line to Por cobrar filtered by that client", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!);
    await page.goto(`/staff/clients/${IDS.ana}`);

    await expect(page.getByText("Falta pagar 2 turnos")).toBeVisible();
    await page.getByRole("link", { name: "Ver en Pagos →" }).click();

    await expect(page).toHaveURL(new RegExp(`/staff/payments\\?view=to-collect&clientId=${IDS.ana}$`));
    const rows = toCollectRows(page);
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Ana Díaz" })).toHaveCount(2);
  });

  test("waives a past charge", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!);
    await page.goto(chargeHref(SEEDED_CHARGE_IDS.juan));
    await expect(page.getByRole("heading", { level: 1, name: "Cobro por fuera · Juan Silva" })).toBeVisible();

    await page.getByRole("button", { name: "No se cobra" }).click();
    const dialog = page.getByRole("dialog", { name: "¿Marcar que no se cobra?" });
    await expect(dialog.getByText("El cobro se cierra y libera el lugar del tope. El cliente no ve nada.")).toBeVisible();
    await dialog.getByPlaceholder("Ej.: cortesía, no va a pagar").fill("Cortesía");
    await dialog.getByRole("button", { name: "No se cobra" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Marcado como que no se cobra." })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "No se cobra" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: /^Lucía Gómez · .+ · Cortesía$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Marcar como pagado" })).toHaveCount(0);
  });

  test("opens a receipt in a new tab", async ({ page, baseURL, context }) => {
    await actAsStaff(page, baseURL!);
    await payFromDetail(page, SEEDED_CHARGE_IDS.sofia, "Sofía Pérez", true);

    const opened = context.waitForEvent("page");
    await page.getByRole("region", { name: "Pagos registrados" }).getByRole("button", { name: "Ver comprobante" }).click();
    const tab = await opened;

    await tab.waitForURL(/\/files\/fake-payment-/);
    expect(new URL(tab.url()).pathname).toMatch(/^\/files\/fake-payment-/);
  });

  test("shows Cobrar hoy on the dashboard and goes to Por cobrar", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!);
    await page.goto("/staff");

    const card = page.getByRole("region", { name: "Cobrar hoy" });
    await expect(card).toContainText("1 cliente");
    await expect(card.getByRole("link", { name: "Ana Díaz" })).toBeVisible();
    await expect(card).toContainText("Performance · 10:00");
    await card.getByRole("link", { name: "Cobrar hoy" }).click();

    // The card's number and the list match: only today's charge, with the chip on.
    await expect(page).toHaveURL(/\/staff\/payments\?view=to-collect&dia=hoy$/);
    await expect(page.getByRole("link", { name: "Solo de hoy" })).toHaveAttribute("aria-current", "true");
    await expect(toCollectRows(page)).toHaveCount(1);
    await expect(toCollectRows(page).first()).toContainText("Ana Díaz");

    // The chip's link drops the filter and the other three open charges come back.
    await page.getByRole("link", { name: "Solo de hoy" }).click();

    await expect(page).toHaveURL(/\/staff\/payments\?view=to-collect$/);
    await expect(page.getByRole("link", { name: "Solo de hoy" })).not.toHaveAttribute("aria-current", "true");
    await expect(toCollectRows(page)).toHaveCount(4);
  });

  test("turning on Solo atrasados from Solo de hoy replaces it", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!);
    await page.goto(`${TO_COLLECT}&dia=hoy`);
    await expect(toCollectRows(page)).toHaveCount(1);

    await page.getByRole("link", { name: "Solo atrasados" }).click();

    await expect(page).toHaveURL(/\/staff\/payments\?view=to-collect&atrasados=true$/);
    await expect(page.getByRole("link", { name: "Solo de hoy" })).not.toHaveAttribute("aria-current", "true");
    await expect(toCollectRows(page)).toHaveCount(1);
    await expect(toCollectRows(page).first()).toContainText("Juan Silva");
  });

  test("an unknown dia is ignored and the whole list shows", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!);
    await page.goto(`${TO_COLLECT}&dia=ayer`);

    await expect(toCollectRows(page)).toHaveCount(4);
    await expect(page.getByRole("link", { name: "Solo de hoy" })).not.toHaveAttribute("aria-current", "true");
  });
});

test.describe("Cancelling an offline booking from attendance", () => {
  test("says the paid one waits in Pagos for review and links to it", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!);
    await payFromDetail(page, SEEDED_CHARGE_IDS.sofia, "Sofía Pérez");

    await page.goto(rosterHref("recovery", 1));
    await cancelFromRoster(page, "Sofía Pérez");

    const snackbar = page.getByRole("status").filter({ hasText: "Ya había pagado: quedó en Pagos para revisar." });
    await expect(snackbar).toBeVisible();
    await expect(snackbar).toContainText("Sofía Pérez");
    await snackbar.getByRole("link", { name: "Ir a Pagos" }).click();

    await expect(page).toHaveURL(/\/staff\/payments\?needsAttention=true$/);
    await expect(page.getByText("Reserva por fuera cancelada").first()).toBeVisible();
  });

  test("keeps the usual snackbar for an unpaid one", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!);
    await page.goto(rosterHref("recovery", 2));
    await expect(page.getByRole("row").filter({ hasText: "Ana Díaz" }).getByRole("link", { name: "Falta pagar" })).toBeVisible();

    await cancelFromRoster(page, "Ana Díaz");

    await expect(page.getByRole("status").filter({ hasText: "Reserva cancelada" })).toBeVisible();
    await expect(page.getByText("Ya había pagado: quedó en Pagos para revisar.")).toHaveCount(0);
  });
});
