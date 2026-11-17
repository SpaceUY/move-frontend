import type { MyPaymentDto, ServiceType, SettingsValues, StaffPersonDto } from "@/lib/api/types";

import { SLOT_SUFFIX_OPEN } from "./checkout-fixtures";

// The staff booking scenarios: the seed lives in fake-offline-charges.ts, dated relative to today.
export const STAFF_BOOKING_CLIENT_IDS = {
  sofia: "client-sofia-perez",
  juan: "client-juan-silva",
  ana: "client-ana-diaz",
  diego: "client-diego-baja",
} as const;

// Fixed ids of the seeded charges, so a spec can open one directly.
export const SEEDED_CHARGE_IDS = {
  sofia: "charge-sofia-recovery",
  juan: "charge-juan-rehab",
  anaToday: "charge-ana-performance",
  anaLater: "charge-ana-recovery",
} as const;

export const OFFLINE_CHARGE_LIMIT = 2;
export const BOOKING_WINDOW_DAYS = 30;
export const RECEIPT_MAX_BYTES = 1 * 1024 * 1024;
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export const E2E_STAFF_PERSON: StaffPersonDto = { id: "staff-e2e", name: "Lucía Gómez" };
export const OTHER_STAFF_PERSON: StaffPersonDto = { id: "staff-valentina", name: "Valentina Velásquez" };

// GET /staff/settings: the four offline prices the backend puts on a charge when Staff books.
export const STAFF_SETTINGS: SettingsValues = {
  cancelLimitHours: 24,
  bookingWindowDays: BOOKING_WINDOW_DAYS,
  pendingPaymentMinutes: 15,
  expiringSoonDays: 7,
  noAttendanceDays: 14,
  prolongedInactivityDays: 30,
  frequencyDropRatio: 0.5,
  renewalGraceDays: 30,
  offlinePriceRehabEvaluation: 1800,
  offlinePriceRehabFollowup: 1500,
  offlinePriceRecoverySession: 900,
  offlinePricePerformanceClass: 600,
  offlineUnpaidLimit: OFFLINE_CHARGE_LIMIT,
  offlineDiscountEnabled: false,
  offlineDiscountPercent: null,
  transferEnabled: false,
  transferDetails: null,
};

const BUSINESS_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in Montevideo, `offset` days from today (Uruguay has no daylight saving). */
export function businessDateFromToday(offset = 0): string {
  return businessDateOf(Date.now() + offset * MS_PER_DAY);
}

/** YYYY-MM-DD in Montevideo of an instant (ms or ISO). */
export function businessDateOf(instant: number | string): string {
  return BUSINESS_DATE_FORMAT.format(new Date(instant));
}

/** The bookable 10:00 slot of a service on a business date, as the fake API names it. */
export function openSlotId(service: ServiceType, date: string): string {
  return `slot-${service}-${date}-${SLOT_SUFFIX_OPEN}`;
}

// A 1×1 transparent PNG: what GET /files/:token answers.
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

// `offline-paid`: the client's history with a cash payment recorded by the team (with its receipt) and a Mercado Pago one.
export const OFFLINE_PAID_IDS = { cash: "pay-offline-cash", mercadoPago: "pay-mercado-pago" } as const;

export const OFFLINE_PAID_PAYMENTS: MyPaymentDto[] = [
  {
    id: OFFLINE_PAID_IDS.cash,
    state: "approved",
    origin: "one_time",
    paymentMethod: "cash",
    kind: "booking",
    service: "rehab",
    itemName: "Evaluación",
    amount: 1800,
    currency: "UYU",
    createdAt: "2026-10-28T14:00:00.000Z",
    approvedAt: "2026-10-30T15:20:00.000Z",
    paidOn: "2026-10-30",
    hasReceipt: true,
    lastPaymentAt: null,
    refundedAt: null,
    paymentId: null,
    reasonCode: null,
    delivered: { type: "booking", startsAt: "2026-10-30T13:00:00.000Z" },
  },
  {
    id: OFFLINE_PAID_IDS.mercadoPago,
    state: "approved",
    origin: "one_time",
    paymentMethod: "mercado_pago",
    kind: "booking",
    service: "recovery",
    itemName: "Sesión individual",
    amount: 900,
    currency: "UYU",
    createdAt: "2026-10-14T20:19:00.000Z",
    approvedAt: "2026-10-14T20:20:00.000Z",
    paidOn: null,
    hasReceipt: false,
    lastPaymentAt: "2026-10-14T20:19:30.000Z",
    refundedAt: null,
    paymentId: "1234490021",
    reasonCode: null,
    delivered: { type: "booking", startsAt: "2026-10-16T21:00:00.000Z" },
  },
];
