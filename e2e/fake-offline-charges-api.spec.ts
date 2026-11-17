import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";

import type {
  BookableSlot,
  CancelBookingResultDto,
  ClientDetail,
  ClientPage,
  MyPaymentPageDto,
  MySubscriptionsDto,
  OfflineChargeDetailDto,
  OfflineChargeListDto,
  ReceiptLinkDto,
  RosterItem,
  StaffBookingsBatchDto,
  StaffPaymentPageDto,
  StaffSlotEligibilityDto,
} from "@/lib/api/types";

import {
  businessDateFromToday,
  OFFLINE_PAID_IDS,
  RECEIPT_MAX_BYTES,
  openSlotId,
  SEEDED_CHARGE_IDS,
  STAFF_BOOKING_CLIENT_IDS as IDS,
  TINY_PNG,
} from "./support/offline-charges-fixtures";
import { OWNER_COOKIE, SCENARIO_COOKIE } from "./support/scenarios";

const ORIGIN = `http://localhost:${Number(process.env.E2E_API_PORT ?? 4300)}`;
const API = `${ORIGIN}/api/v1`;
const LIMIT_MESSAGE =
  "Este cliente ya tiene 2 reservas por fuera sin cobrar. Registrá un pago o cerrá un cobro antes de reservar otra.";

// Each test is its own staff member, so what one changes never shows up in another running in parallel.
function as(scenario: string, owner: string = randomUUID()): { Cookie: string } {
  return { Cookie: `${SCENARIO_COOKIE}=${scenario}; ${OWNER_COOKIE}=${owner}` };
}

function chargePath(id: string): string {
  return `${API}/staff/offline-charges/${id}`;
}

async function payInCash(
  request: APIRequestContext,
  headers: { Cookie: string },
  chargeId: string,
): Promise<OfflineChargeDetailDto> {
  const response = await request.post(`${chargePath(chargeId)}/payment`, {
    headers,
    data: { method: "cash", amount: 900, paidOn: businessDateFromToday(0) },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

function receiptForm(buffer: Buffer, mimeType: string, paidOn = businessDateFromToday(0)) {
  return {
    method: "transfer",
    amount: "1800",
    paidOn,
    note: "Desde la cuenta de la madre",
    receipt: { name: "comprobante.png", mimeType, buffer },
  };
}

test.describe("fake API: staff booking and offline charges", () => {
  test("only answers staff-booking scenarios, and an empty list of open charges to any other staff one", async ({
    request,
  }) => {
    for (const scenario of ["staff", "staff-clients", "staff-birthdays"]) {
      const response = await request.get(`${API}/staff/offline-charges`, { headers: as(scenario) });
      expect(response.status(), scenario).toBe(200);
      expect(await response.json()).toEqual({ items: [], total: 0, limitPerClient: 2 });
    }

    const elsewhere = await request.get(`${API}/staff/clients/${IDS.sofia}/subscriptions`, { headers: as("staff") });
    expect(elsewhere.status()).toBe(404);
    expect(await elsewhere.json()).toMatchObject({ code: "NOT_FOUND" });

    // The other stores keep their routes: the staff clients' record and the follow-up's.
    const record = await request.get(`${API}/staff/clients/client-ana-gomez`, { headers: as("staff-clients") });
    expect(record.status()).toBe(200);
    expect(await record.json()).toMatchObject({ id: "client-ana-gomez", name: "Ana" });
    const followupRecord = await request.get(`${API}/staff/clients/client-ana-perez`, { headers: as("staff") });
    expect(followupRecord.status()).toBe(200);

    expect((await request.get(`${API}/staff/offline-charges`, { headers: as("none") })).status()).toBe(404);
    expect((await request.get(`${API}/staff/offline-charges`)).status()).toBe(404);
    const settings = await request.get(`${API}/staff/settings`, { headers: as("staff") });
    expect(settings.status()).toBe(404);
  });

  test("lists the open charges with the past slot first, and filters by client and booking", async ({ request }) => {
    const headers = as("staff-booking");

    const all: OfflineChargeListDto = await (await request.get(`${API}/staff/offline-charges`, { headers })).json();
    expect(all).toMatchObject({ total: 4, limitPerClient: 2 });
    expect(all.items[0]).toMatchObject({ id: SEEDED_CHARGE_IDS.juan, slotStarted: true, amount: null });
    expect(all.items[0].client).toMatchObject({ id: IDS.juan, name: "Juan Silva" });
    expect(all.items.every((charge) => charge.status === "pending")).toBe(true);
    expect("payments" in all.items[0]).toBe(false);

    const ana: OfflineChargeListDto = await (
      await request.get(`${API}/staff/offline-charges?clientId=${IDS.ana}`, { headers })
    ).json();
    expect(ana.items.map((charge) => charge.id)).toEqual([SEEDED_CHARGE_IDS.anaToday, SEEDED_CHARGE_IDS.anaLater]);

    const byBooking: OfflineChargeListDto = await (
      await request.get(`${API}/staff/offline-charges?bookingIds=booking-juan-rehab,booking-unknown`, { headers })
    ).json();
    expect(byBooking.items.map((charge) => charge.id)).toEqual([SEEDED_CHARGE_IDS.juan]);

    const overdue: OfflineChargeListDto = await (
      await request.get(`${API}/staff/offline-charges?overdue=true`, { headers })
    ).json();
    expect(overdue.items.map((charge) => charge.id)).toEqual([SEEDED_CHARGE_IDS.juan]);

    const today: OfflineChargeListDto = await (
      await request.get(`${API}/staff/offline-charges?today=true`, { headers })
    ).json();
    expect(today.items.map((charge) => charge.id)).toEqual([SEEDED_CHARGE_IDS.anaToday]);
    expect(today.total).toBe(1);

    const todayAndOverdue: OfflineChargeListDto = await (
      await request.get(`${API}/staff/offline-charges?today=true&overdue=true`, { headers })
    ).json();
    expect(todayAndOverdue).toMatchObject({ items: [], total: 0 });
    expect((await request.get(`${API}/staff/offline-charges?today=maybe`, { headers })).status()).toBe(400);

    const tooMany = Array.from({ length: 101 }, (_, index) => `booking-${index}`).join(",");
    expect((await request.get(`${API}/staff/offline-charges?bookingIds=${tooMany}`, { headers })).status()).toBe(400);
  });

  test("searches only active clients, reads a record and its follow-up, and refuses a deactivated client", async ({
    request,
  }) => {
    const headers = as("staff-booking");

    const page: ClientPage = await (await request.get(`${API}/staff/clients?q=a&pageSize=8`, { headers })).json();
    expect(page.items.map((client) => client.id)).toEqual([IDS.ana, IDS.juan, IDS.sofia]);

    const diego: ClientDetail = await (await request.get(`${API}/staff/clients/${IDS.diego}`, { headers })).json();
    expect(diego.deactivation).toMatchObject({ reason: "Se mudó" });

    const followup = await request.get(`${API}/staff/clients/${IDS.sofia}/followup`, { headers });
    expect(await followup.json()).toEqual({ pause: null, pauses: [], contacts: [] });

    for (const path of ["subscriptions", "offline-charge-allowance", "slots?service=rehab&date=2026-11-10"]) {
      const refused = await request.get(`${API}/staff/clients/${IDS.diego}/${path}`, { headers });
      expect(refused.status(), path).toBe(403);
      expect(await refused.json()).toMatchObject({ code: "ACCOUNT_DEACTIVATED" });
    }
    const unknown = await request.get(`${API}/staff/clients/client-nobody/subscriptions`, { headers });
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toMatchObject({ code: "CLIENT_NOT_FOUND" });
  });

  test("answers the plans, the slots with the client's eligibility, the window and the four prices", async ({
    request,
  }) => {
    const headers = as("staff-booking");
    const date = businessDateFromToday(2);

    const plans: MySubscriptionsDto = await (
      await request.get(`${API}/staff/clients/${IDS.sofia}/subscriptions`, { headers })
    ).json();
    expect(plans.performance).toMatchObject({ planName: "Mensual", status: "active" });
    expect(plans.recoveryPacks[0]).toMatchObject({ planName: "Paquete 8 sesiones", sessionsLeft: 1 });

    const sofiaSlots: BookableSlot[] = await (
      await request.get(`${API}/staff/clients/${IDS.sofia}/slots?service=performance&date=${date}`, { headers })
    ).json();
    expect(sofiaSlots[0]).toMatchObject({ id: openSlotId("performance", date), eligibility: { covered: true } });

    const juanSlots: BookableSlot[] = await (
      await request.get(`${API}/staff/clients/${IDS.juan}/slots?service=performance&date=${date}`, { headers })
    ).json();
    expect(juanSlots[0].eligibility).toEqual({ covered: false, reason: "PLAN_REQUIRED" });

    // Sofía already has tomorrow's Recovery slot.
    const tomorrow = businessDateFromToday(1);
    const recovery: BookableSlot[] = await (
      await request.get(`${API}/staff/clients/${IDS.sofia}/slots?service=recovery&date=${tomorrow}`, { headers })
    ).json();
    expect(recovery[0].alreadyBooked).toBe(true);

    expect(await (await request.get(`${API}/bookings/window`, { headers })).json()).toEqual({
      bookingWindowDays: 30,
      lastBookableDate: businessDateFromToday(30),
    });
    expect(await (await request.get(`${API}/staff/settings`, { headers })).json()).toMatchObject({
      offlinePriceRehabEvaluation: 1800,
      offlinePriceRehabFollowup: 1500,
      offlinePriceRecoverySession: 900,
      offlinePricePerformanceClass: 600,
    });
  });

  test("spends the pack in the cart's order and always charges Rehab offline in the preview", async ({ request }) => {
    const verdicts: StaffSlotEligibilityDto[] = await (
      await request.post(`${API}/staff/clients/${IDS.sofia}/batch-eligibility`, {
        headers: as("staff-booking"),
        data: {
          timeSlotIds: [
            openSlotId("recovery", businessDateFromToday(2)),
            openSlotId("recovery", businessDateFromToday(3)),
            openSlotId("rehab", businessDateFromToday(2)),
          ],
        },
      })
    ).json();

    expect(verdicts.map(({ covered, reason, chargedOffline }) => ({ covered, reason, chargedOffline }))).toEqual([
      { covered: true, reason: null, chargedOffline: false },
      { covered: false, reason: "PACKAGE_REQUIRED", chargedOffline: true },
      { covered: null, reason: "NOT_APPLICABLE", chargedOffline: true },
    ]);
  });

  test("books with the price of Configuración and refuses an amount in the body", async ({ request }) => {
    const headers = as("staff-booking");
    const slotId = openSlotId("rehab", businessDateFromToday(2));

    const withAmount = await request.post(`${API}/staff/clients/${IDS.juan}/bookings`, {
      headers,
      data: { paymentMethod: "cash", items: [{ timeSlotId: slotId, amount: 1000 }] },
    });
    expect(withAmount.status()).toBe(400);
    expect(await withAmount.json()).toMatchObject({ code: "VALIDATION_FAILED" });

    const response = await request.post(`${API}/staff/clients/${IDS.juan}/bookings`, {
      headers,
      data: { paymentMethod: "transfer", items: [{ timeSlotId: slotId, rehabKind: "followup" }] },
    });
    expect(response.status()).toBe(200);
    const batch: StaffBookingsBatchDto = await response.json();
    expect(batch.failed).toEqual([]);
    expect(batch.booked[0]).toMatchObject({
      timeSlotId: slotId,
      source: "staff_offline",
      rehabKind: "followup",
      offlineCharge: { status: "pending", paymentMethod: "transfer", amount: 1500, currency: "UYU" },
    });

    const allowance = await request.get(`${API}/staff/clients/${IDS.juan}/offline-charge-allowance`, { headers });
    expect(await allowance.json()).toEqual({ open: 2, limit: 2, remaining: 0 });

    const again = await request.post(`${API}/staff/clients/${IDS.juan}/bookings`, {
      headers,
      data: { items: [{ timeSlotId: slotId }] },
    });
    expect(((await again.json()) as StaffBookingsBatchDto).failed[0]).toMatchObject({ code: "ALREADY_BOOKED" });
  });

  test("answers OFFLINE_CHARGE_LIMIT_REACHED per slot and still books what the plan covers", async ({ request }) => {
    const headers = as("staff-booking");

    const ana: StaffBookingsBatchDto = await (
      await request.post(`${API}/staff/clients/${IDS.ana}/bookings`, {
        headers,
        data: { items: [{ timeSlotId: openSlotId("performance", businessDateFromToday(3)) }] },
      })
    ).json();
    expect(ana.booked).toEqual([]);
    expect(ana.failed).toEqual([
      {
        timeSlotId: openSlotId("performance", businessDateFromToday(3)),
        code: "OFFLINE_CHARGE_LIMIT_REACHED",
        message: LIMIT_MESSAGE,
      },
    ]);

    const sofia: StaffBookingsBatchDto = await (
      await request.post(`${API}/staff/clients/${IDS.sofia}/bookings`, {
        headers,
        data: {
          items: [
            { timeSlotId: openSlotId("performance", businessDateFromToday(3)) },
            { timeSlotId: openSlotId("recovery", businessDateFromToday(3)) },
            { timeSlotId: openSlotId("recovery", businessDateFromToday(4)) },
            { timeSlotId: openSlotId("recovery", businessDateFromToday(5)) },
          ],
        },
      })
    ).json();
    expect(sofia.booked.map((booked) => booked.source)).toEqual(["plan", "package", "staff_offline"]);
    expect(sofia.booked[2].offlineCharge).toMatchObject({ amount: 900, paymentMethod: "undecided" });
    expect(sofia.failed.map((failed) => failed.code)).toEqual(["OFFLINE_CHARGE_LIMIT_REACHED"]);
  });

  test("records a payment as JSON or as multipart with a receipt, and serves the receipt's file", async ({
    request,
  }) => {
    const headers = as("staff-booking");

    const cash = await payInCash(request, headers, SEEDED_CHARGE_IDS.sofia);
    expect(cash).toMatchObject({ status: "approved", payment: { method: "cash", amount: 900, hasReceipt: false } });

    const response = await request.post(`${chargePath(SEEDED_CHARGE_IDS.juan)}/payment`, {
      headers,
      multipart: receiptForm(TINY_PNG, "image/png"),
    });
    expect(response.status()).toBe(200);
    const detail: OfflineChargeDetailDto = await response.json();
    expect(detail).toMatchObject({ status: "approved", paymentMethod: "transfer", amount: 1800 });
    expect(detail.payments[0]).toMatchObject({ hasReceipt: true, note: "Desde la cuenta de la madre", voidedAt: null });

    const paymentId = detail.payments[0].id;
    const link: ReceiptLinkDto = await (
      await request.get(`${chargePath(SEEDED_CHARGE_IDS.juan)}/payments/${paymentId}/receipt`, { headers })
    ).json();
    expect(link.url).toBe(`${ORIGIN}/files/fake-${paymentId}`);
    const file = await request.get(link.url);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/png");

    const noReceipt = await request.get(
      `${chargePath(SEEDED_CHARGE_IDS.sofia)}/payments/${cash.payments[0].id}/receipt`,
      { headers },
    );
    expect(noReceipt.status()).toBe(404);
    expect(await noReceipt.json()).toMatchObject({ code: "RECEIPT_NOT_FOUND" });
  });

  test("answers 413, 415, a future date and a charge that is no longer open", async ({ request }) => {
    const headers = as("staff-booking");
    const path = `${chargePath(SEEDED_CHARGE_IDS.juan)}/payment`;

    const tooBig = await request.post(path, {
      headers,
      multipart: receiptForm(Buffer.alloc(1024 * 1024 + 1), "image/png"),
    });
    expect(tooBig.status()).toBe(413);
    expect(await tooBig.json()).toMatchObject({ code: "RECEIPT_TOO_LARGE" });

    const wrongType = await request.post(path, { headers, multipart: receiptForm(Buffer.from("hola"), "text/plain") });
    expect(wrongType.status()).toBe(415);
    expect(await wrongType.json()).toMatchObject({ code: "RECEIPT_TYPE_NOT_ALLOWED" });

    const future = await request.post(path, {
      headers,
      data: { method: "cash", amount: 1800, paidOn: businessDateFromToday(1) },
    });
    expect(future.status()).toBe(400);
    expect(await future.json()).toMatchObject({ code: "OFFLINE_PAYMENT_DATE_IN_FUTURE" });

    const tooOld = await request.post(path, {
      headers,
      data: { method: "cash", amount: 1800, paidOn: businessDateFromToday(-31) },
    });
    expect(tooOld.status()).toBe(400);
    expect(await tooOld.json()).toMatchObject({ code: "OFFLINE_PAYMENT_DATE_TOO_OLD" });

    const badAmount = await request.post(path, {
      headers,
      data: { method: "cash", amount: 12.345, paidOn: businessDateFromToday(0) },
    });
    expect(badAmount.status()).toBe(400);

    await payInCash(request, headers, SEEDED_CHARGE_IDS.juan);
    const twice = await request.post(path, {
      headers,
      data: { method: "cash", amount: 900, paidOn: businessDateFromToday(0) },
    });
    expect(twice.status()).toBe(409);
    expect(await twice.json()).toMatchObject({ code: "OFFLINE_CHARGE_NOT_OPEN" });
  });

  test("turns the receipt upload off with staff-booking-no-storage", async ({ request }) => {
    const on = await (await request.get(`${API}/staff/offline-charges/receipt-upload`, { headers: as("staff-booking") })).json();
    expect(on).toEqual({
      available: true,
      maxBytes: RECEIPT_MAX_BYTES,
      allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"],
    });

    const headers = as("staff-booking-no-storage");
    const off = await (await request.get(`${API}/staff/offline-charges/receipt-upload`, { headers })).json();
    expect(off).toMatchObject({ available: false });

    const withReceipt = await request.post(`${chargePath(SEEDED_CHARGE_IDS.juan)}/payment`, {
      headers,
      multipart: receiptForm(TINY_PNG, "image/png"),
    });
    expect(withReceipt.status()).toBe(409);
    expect(await withReceipt.json()).toMatchObject({ code: "RECEIPT_UPLOAD_UNAVAILABLE" });

    const paid = await payInCash(request, headers, SEEDED_CHARGE_IDS.juan);
    expect(paid.status).toBe("approved");

    const receipt = await request.get(`${chargePath(SEEDED_CHARGE_IDS.juan)}/payments/${paid.payments[0].id}/receipt`, {
      headers,
    });
    expect(receipt.status()).toBe(409);
    expect(await receipt.json()).toMatchObject({ code: "RECEIPT_UPLOAD_UNAVAILABLE" });
  });

  test("waives only a charge whose slot started", async ({ request }) => {
    const headers = as("staff-booking");

    const notStarted = await request.post(`${chargePath(SEEDED_CHARGE_IDS.sofia)}/waive`, {
      headers,
      data: { reason: "Cortesía" },
    });
    expect(notStarted.status()).toBe(409);
    expect(await notStarted.json()).toMatchObject({ code: "OFFLINE_CHARGE_SLOT_NOT_STARTED" });

    const waived = await request.post(`${chargePath(SEEDED_CHARGE_IDS.juan)}/waive`, {
      headers,
      data: { reason: "Cortesía" },
    });
    expect(await waived.json()).toMatchObject({ status: "waived", closeReason: "Cortesía", closedBy: { name: "Lucía Gómez" } });

    const emptyReason = await request.post(`${chargePath(SEEDED_CHARGE_IDS.anaToday)}/waive`, {
      headers,
      data: { reason: "  " },
    });
    expect(emptyReason.status()).toBe(400);
    expect((await request.get(chargePath("charge-unknown"), { headers })).status()).toBe(404);
  });

  test("lists every charge in Pagos and Juan's booking in his slot's roster", async ({ request }) => {
    const headers = as("staff-booking");
    const yesterday = businessDateFromToday(-1);

    const payments: StaffPaymentPageDto = await (await request.get(`${API}/staff/payments?page=1`, { headers })).json();
    expect(payments.total).toBe(4);
    expect(payments.items.find((item) => item.purchaseId === SEEDED_CHARGE_IDS.juan)).toMatchObject({
      paymentMethod: "undecided",
      amount: null,
      planId: null,
      status: "pending",
    });

    const slots: { id: string }[] = await (
      await request.get(`${API}/staff/time-slots?date=${yesterday}`, { headers })
    ).json();
    expect(slots.map((slot) => slot.id)).toContain(openSlotId("rehab", yesterday));

    const roster: RosterItem[] = await (
      await request.get(`${API}/staff/time-slots/${openSlotId("rehab", yesterday)}/roster`, { headers })
    ).json();
    expect(roster).toEqual([
      {
        bookingId: "booking-juan-rehab",
        client: { id: IDS.juan, name: "Juan", lastName: "Silva" },
        status: "confirmed",
        attendance: null,
        source: "staff_offline",
      },
    ]);
  });

  test("cancels a staff_offline booking: offline_charge if unpaid, offline_charge_paid and flagged in Pagos if paid", async ({
    request,
  }) => {
    const headers = as("staff-booking");

    const unpaid: CancelBookingResultDto = await (
      await request.post(`${API}/staff/bookings/booking-ana-recovery/cancel`, { headers, data: { reason: "Se enfermó" } })
    ).json();
    expect(unpaid).toEqual({ bookingId: "booking-ana-recovery", paymentOutcome: "offline_charge" });
    const anaOpen: OfflineChargeListDto = await (
      await request.get(`${API}/staff/offline-charges?clientId=${IDS.ana}`, { headers })
    ).json();
    expect(anaOpen.items.map((charge) => charge.id)).toEqual([SEEDED_CHARGE_IDS.anaToday]);

    await payInCash(request, headers, SEEDED_CHARGE_IDS.sofia);
    const paid: CancelBookingResultDto = await (
      await request.post(`${API}/staff/bookings/booking-sofia-recovery/cancel`, { headers, data: { reason: "Viaja" } })
    ).json();
    expect(paid).toEqual({ bookingId: "booking-sofia-recovery", paymentOutcome: "offline_charge_paid" });

    const review: StaffPaymentPageDto = await (
      await request.get(`${API}/staff/payments?needsAttention=true`, { headers })
    ).json();
    expect(review.items).toHaveLength(1);
    expect(review.items[0]).toMatchObject({
      purchaseId: SEEDED_CHARGE_IDS.sofia,
      status: "approved",
      attentionReason: "offline_booking_cancelled",
    });

    // A slot that already started cannot be cancelled.
    const started = await request.post(`${API}/staff/bookings/booking-juan-rehab/cancel`, {
      headers,
      data: { reason: "Tarde" },
    });
    expect(started.status()).toBe(409);
  });

  test("offline-paid: the client's history with the paid cash charge and its receipt", async ({ request }) => {
    const headers = as("offline-paid");

    const history: MyPaymentPageDto = await (await request.get(`${API}/me/payments?page=1`, { headers })).json();
    expect(history.items.map((payment) => payment.paymentMethod)).toEqual(["cash", "mercado_pago"]);
    expect(history.items[0]).toMatchObject({ paidOn: "2026-10-30", hasReceipt: true });

    const link: ReceiptLinkDto = await (
      await request.get(`${API}/me/payments/${OFFLINE_PAID_IDS.cash}/receipt`, { headers })
    ).json();
    expect(link.url).toBe(`${ORIGIN}/files/fake-${OFFLINE_PAID_IDS.cash}`);

    const mercadoPago = await request.get(`${API}/me/payments/${OFFLINE_PAID_IDS.mercadoPago}/receipt`, { headers });
    expect(mercadoPago.status()).toBe(404);

    // Any other client scenario keeps its own history.
    const other: MyPaymentPageDto = await (await request.get(`${API}/me/payments`, { headers: as("payments-empty") })).json();
    expect(other.total).toBe(0);
  });
});
