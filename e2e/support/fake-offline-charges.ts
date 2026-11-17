import { randomUUID } from "node:crypto";

import type {
  BookingPaymentChoice,
  BookingSource,
  CancelBookingResultDto,
  CancellationPaymentOutcome,
  ClientDetail,
  ClientPage,
  ClientRow,
  DailySlot,
  MyPaymentPageDto,
  MySubscriptionsDto,
  OfflineChargeDetailDto,
  OfflineChargeDto,
  OfflineChargeListDto,
  OfflinePaymentDto,
  OfflinePaymentMethod,
  RehabKind,
  RosterItem,
  ServiceType,
  SlotEligibility,
  StaffBookedDto,
  StaffPaymentDto,
  StaffPaymentPageDto,
  StaffSlotEligibilityDto,
} from "@/lib/api/types";

import { E2E_PLAN_IDS, E2E_PLANS, e2eSlotsFor, SLOT_SUFFIX_FULL, slotStartsAt } from "./checkout-fixtures";
import { failure, type FakeResponse, readString } from "./fake-checkout";
import {
  BOOKING_WINDOW_DAYS,
  businessDateFromToday,
  businessDateOf,
  E2E_STAFF_PERSON,
  OFFLINE_CHARGE_LIMIT,
  OFFLINE_PAID_PAYMENTS,
  openSlotId,
  OTHER_STAFF_PERSON,
  RECEIPT_MAX_BYTES,
  RECEIPT_TYPES,
  SEEDED_CHARGE_IDS,
  STAFF_BOOKING_CLIENT_IDS,
  STAFF_SETTINGS,
  TINY_PNG,
} from "./offline-charges-fixtures";
import { DEFAULT_OWNER, isStaffScenario, type OfflinePaidScenario } from "./scenarios";

interface RequestContext {
  url: URL;
  scenario: string;
  owner: string;
  body: unknown;
  params: string[];
}

interface Route {
  method: string;
  pattern: RegExp;
  respond: (context: RequestContext) => FakeResponse;
}

interface FakeClient {
  detail: ClientDetail;
  subscriptions: MySubscriptionsDto;
}

interface FakeBooking {
  id: string;
  clientId: string;
  timeSlotId: string;
  service: ServiceType;
  startsAt: string;
  endsAt: string;
  status: RosterItem["status"];
  source: BookingSource;
}

// What one test changes: kept per owner so tests running in parallel do not see each other's.
interface OfflineState {
  clients: FakeClient[];
  bookings: FakeBooking[];
  charges: OfflineChargeDetailDto[];
}

const API_PREFIX = "/api/v1";
const FILE_PATTERN = /^\/files\/(fake-[^/]+)$/;
const SCENARIO_PREFIX = "staff-booking";
const SCENARIO_NO_STORAGE = "staff-booking-no-storage";
export const OFFLINE_PAID_SCENARIOS: readonly string[] = ["offline-paid"] satisfies OfflinePaidScenario[];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_ID_PATTERN = /^slot-(performance|rehab|recovery)-(\d{4}-\d{2}-\d{2})-(\d{4})$/;
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const SERVICES: readonly ServiceType[] = ["performance", "rehab", "recovery"];
const PAYMENT_CHOICES: readonly BookingPaymentChoice[] = ["cash", "transfer", "undecided"];
const OFFLINE_METHODS: readonly OfflinePaymentMethod[] = ["cash", "transfer"];
const REHAB_KIND_VALUES: readonly RehabKind[] = ["evaluation", "followup"];
const MAX_BATCH = 60;
const MAX_BOOKING_IDS = 100;
const MAX_AMOUNT = 100_000;
const REASON_MAX_LENGTH = 240;
const CANCEL_REASON_MAX_LENGTH = 200;
const NOTE_MAX_LENGTH = 280;
const DEFAULT_PAGE_SIZE = 20;
const RECEIPT_LINK_TTL_MS = 5 * 60 * 1000;
const MS_PER_MINUTE = 60_000;
// Every slot of e2eSlotsFor lasts this long.
const SLOT_DURATION_MINUTES = 45;

const VALIDATION_FAILED = failure(400, "VALIDATION_FAILED", "Los datos enviados no son válidos.");
const CLIENT_NOT_FOUND = failure(404, "CLIENT_NOT_FOUND", "El cliente no existe.");
const ACCOUNT_DEACTIVATED = failure(
  403,
  "ACCOUNT_DEACTIVATED",
  "Tu cuenta está desactivada. Escribile a MOVE para reactivarla.",
);
const SLOT_NOT_FOUND = failure(404, "SLOT_NOT_FOUND", "El turno no existe.");
const BOOKING_NOT_FOUND = failure(404, "BOOKING_NOT_FOUND", "La reserva no existe.");
const BOOKING_NOT_CANCELLABLE = failure(409, "BOOKING_NOT_CANCELLABLE", "Esta reserva no se puede cancelar.");
const NOT_FOUND = failure(404, "NOT_FOUND", "No encontrado.");
const CHARGE_NOT_FOUND = failure(404, "OFFLINE_CHARGE_NOT_FOUND", "El cobro no existe.");
const CHARGE_NOT_OPEN = failure(409, "OFFLINE_CHARGE_NOT_OPEN", "Este cobro ya no está por cobrar.");
const SLOT_NOT_STARTED = failure(
  409,
  "OFFLINE_CHARGE_SLOT_NOT_STARTED",
  "El turno todavía no empezó: cancelá la reserva en lugar de marcar que no se cobra.",
);
const DATE_IN_FUTURE = failure(400, "OFFLINE_PAYMENT_DATE_IN_FUTURE", "La fecha del pago no puede ser futura.");
const DATE_TOO_OLD = failure(400, "OFFLINE_PAYMENT_DATE_TOO_OLD", "La fecha no puede ser de hace más de 30 días.");
const MAX_PAYMENT_DAYS_BACK = 30;
const UPLOAD_UNAVAILABLE = failure(409, "RECEIPT_UPLOAD_UNAVAILABLE", "Adjuntar comprobante no está disponible todavía.");
const RECEIPT_TOO_LARGE = failure(413, "RECEIPT_TOO_LARGE", "El comprobante no puede pesar más de 1 MB.");
const RECEIPT_TYPE_NOT_ALLOWED = failure(
  415,
  "RECEIPT_TYPE_NOT_ALLOWED",
  "El comprobante tiene que ser una foto (JPG, PNG, WEBP o HEIC) o un PDF.",
);
const RECEIPT_NOT_FOUND = failure(404, "RECEIPT_NOT_FOUND", "El comprobante no existe.");

// What the backend answers per slot in `failed`.
const SLOT_FAILURES = {
  SLOT_NOT_FOUND: "El turno no existe.",
  SLOT_NOT_BOOKABLE: "Este turno ya no admite reservas.",
  ALREADY_BOOKED: "Ya tenés una reserva activa para este turno.",
  SLOT_FULL: "No quedan cupos para este turno.",
  OFFLINE_CHARGE_LIMIT_REACHED:
    "Este cliente ya tiene 2 reservas por fuera sin cobrar. Registrá un pago o cerrá un cobro antes de reservar otra.",
} as const;
type SlotFailureCode = keyof typeof SLOT_FAILURES;

const ITEM_NAMES: Record<ServiceType, string> = {
  performance: "Clase suelta de Performance",
  recovery: "Sesión suelta de Recovery",
  rehab: "Evaluación de Rehab",
};
const REHAB_FOLLOWUP_NAME = "Seguimiento de Rehab";
const REHAB_KIND_LABELS: Record<RehabKind, string> = { evaluation: "Evaluación", followup: "Seguimiento" };

export function isStaffBookingScenario(scenario: string | null): boolean {
  return scenario !== null && scenario.startsWith(SCENARIO_PREFIX);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === "string" && options.some((option) => option === value);
}

function fullNameOf(detail: Pick<ClientDetail, "name" | "lastName">): string {
  return `${detail.name} ${detail.lastName ?? ""}`.trim();
}

function parseSlotId(timeSlotId: string): { service: ServiceType; date: string; suffix: string } | null {
  const match = SLOT_ID_PATTERN.exec(timeSlotId);
  if (!match) return null;
  const [, service, date, suffix] = match;
  return isOneOf(SERVICES, service) ? { service, date, suffix } : null;
}

function isStarted(startsAt: string): boolean {
  return Date.parse(startsAt) <= Date.now();
}

function endsAtOf(startsAt: string): string {
  return new Date(Date.parse(startsAt) + SLOT_DURATION_MINUTES * MS_PER_MINUTE).toISOString();
}

function planName(planId: string): string {
  return E2E_PLANS.find((plan) => plan.id === planId)?.name ?? planId;
}

function seedClient(fields: Pick<ClientDetail, "id" | "name" | "lastName" | "email"> & Partial<ClientDetail>): ClientDetail {
  return {
    phone: "+59899123456",
    birthDate: "1990-03-12",
    age: 36,
    clientSince: "2026-01-10T12:00:00.000Z",
    plan: null,
    paymentStatus: null,
    bookings: [],
    deactivation: null,
    ...fields,
  };
}

// A new object per client: a client's plans are changed in place when a pack session is spent.
function noPlans(): MySubscriptionsDto {
  return { performance: null, upcomingPerformances: [], recoveryPacks: [] };
}

function sofiaSubscriptions(): MySubscriptionsDto {
  return {
    performance: {
      id: "sub-sofia-mensual",
      planId: E2E_PLAN_IDS.mensual,
      planName: planName(E2E_PLAN_IDS.mensual),
      startsOn: businessDateFromToday(-10),
      endsOn: businessDateFromToday(20),
      status: "active",
      daysLeft: 20,
      expiringSoon: false,
      purchaseId: null,
      awaitingPayment: false,
    },
    upcomingPerformances: [],
    recoveryPacks: [
      {
        id: "pack-sofia-8",
        planId: E2E_PLAN_IDS.pack8,
        planName: planName(E2E_PLAN_IDS.pack8),
        startsOn: businessDateFromToday(-20),
        endsOn: businessDateFromToday(10),
        sessionsTotal: 8,
        sessionsUsed: 7,
        sessionsLeft: 1,
        daysLeft: 10,
        expiringSoon: false,
        purchaseId: null,
        awaitingPayment: false,
      },
    ],
  };
}

function seedBooking(id: string, clientId: string, service: ServiceType, dayOffset: number): FakeBooking {
  const date = businessDateFromToday(dayOffset);
  const startsAt = slotStartsAt(date, "1000")!;
  return {
    id,
    clientId,
    timeSlotId: openSlotId(service, date),
    service,
    startsAt,
    endsAt: endsAtOf(startsAt),
    status: "confirmed",
    source: "staff_offline",
  };
}

function newCharge(
  id: string,
  client: ClientDetail,
  booking: FakeBooking,
  fields: Pick<OfflineChargeDto, "paymentMethod" | "amount" | "itemName" | "bookedBy" | "createdAt">,
): OfflineChargeDetailDto {
  return {
    id,
    kind: "booking",
    planStartsOn: null,
    paysWith: null,
    client: { id: client.id, name: fullNameOf(client), email: client.email },
    bookingId: booking.id,
    service: booking.service,
    booking: { startsAt: booking.startsAt, status: booking.status },
    slotStarted: isStarted(booking.startsAt),
    status: "pending",
    currency: "UYU",
    closedAt: null,
    closedBy: null,
    closeReason: null,
    needsAttention: false,
    attentionReason: null,
    attentionNote: null,
    payment: null,
    payments: [],
    ...fields,
  };
}

// Sofía: plan and a pack with 1 session, 1 open charge tomorrow. Juan: no plans, 1 charge of yesterday.
// Ana: no plans, at the cap (one charge today, one in two days). Diego: deactivated.
function newState(): OfflineState {
  const yesterday = new Date(Date.now() - 24 * 60 * MS_PER_MINUTE).toISOString();
  const sofia = seedClient({
    id: STAFF_BOOKING_CLIENT_IDS.sofia,
    name: "Sofía",
    lastName: "Pérez",
    email: "sofia@move.test",
    plan: { name: planName(E2E_PLAN_IDS.mensual), endsOn: businessDateFromToday(20) },
    paymentStatus: "up_to_date",
  });
  const juan = seedClient({ id: STAFF_BOOKING_CLIENT_IDS.juan, name: "Juan", lastName: "Silva", email: "juan@move.test" });
  const ana = seedClient({ id: STAFF_BOOKING_CLIENT_IDS.ana, name: "Ana", lastName: "Díaz", email: "ana.diaz@move.test" });
  const diego = seedClient({
    id: STAFF_BOOKING_CLIENT_IDS.diego,
    name: "Diego",
    lastName: "Baja",
    email: "diego@move.test",
    deactivation: {
      deactivatedAt: "2026-10-20T13:00:00.000Z",
      deactivatedByName: OTHER_STAFF_PERSON.name,
      reason: "Se mudó",
    },
  });

  const sofiaBooking = seedBooking("booking-sofia-recovery", sofia.id, "recovery", 1);
  const juanBooking = seedBooking("booking-juan-rehab", juan.id, "rehab", -1);
  const anaToday = seedBooking("booking-ana-performance", ana.id, "performance", 0);
  const anaLater = seedBooking("booking-ana-recovery", ana.id, "recovery", 2);

  return {
    clients: [
      { detail: sofia, subscriptions: sofiaSubscriptions() },
      { detail: juan, subscriptions: noPlans() },
      { detail: ana, subscriptions: noPlans() },
      { detail: diego, subscriptions: noPlans() },
    ],
    bookings: [sofiaBooking, juanBooking, anaToday, anaLater],
    charges: [
      newCharge(SEEDED_CHARGE_IDS.sofia, sofia, sofiaBooking, {
        paymentMethod: "cash",
        amount: STAFF_SETTINGS.offlinePriceRecoverySession,
        itemName: ITEM_NAMES.recovery,
        bookedBy: OTHER_STAFF_PERSON,
        createdAt: yesterday,
      }),
      newCharge(SEEDED_CHARGE_IDS.juan, juan, juanBooking, {
        paymentMethod: "undecided",
        amount: null,
        itemName: ITEM_NAMES.rehab,
        bookedBy: E2E_STAFF_PERSON,
        createdAt: yesterday,
      }),
      newCharge(SEEDED_CHARGE_IDS.anaToday, ana, anaToday, {
        paymentMethod: "transfer",
        amount: STAFF_SETTINGS.offlinePricePerformanceClass,
        itemName: ITEM_NAMES.performance,
        bookedBy: E2E_STAFF_PERSON,
        createdAt: yesterday,
      }),
      newCharge(SEEDED_CHARGE_IDS.anaLater, ana, anaLater, {
        paymentMethod: "undecided",
        amount: STAFF_SETTINGS.offlinePriceRecoverySession,
        itemName: ITEM_NAMES.recovery,
        bookedBy: E2E_STAFF_PERSON,
        createdAt: yesterday,
      }),
    ],
  };
}

function priceFor(service: ServiceType, rehabKind: RehabKind | null): number | null {
  if (service === "performance") return STAFF_SETTINGS.offlinePricePerformanceClass;
  if (service === "recovery") return STAFF_SETTINGS.offlinePriceRecoverySession;
  return rehabKind === "followup" ? STAFF_SETTINGS.offlinePriceRehabFollowup : STAFF_SETTINGS.offlinePriceRehabEvaluation;
}

function packLeftOf(client: FakeClient): number {
  return client.subscriptions.recoveryPacks.reduce((total, pack) => total + pack.sessionsLeft, 0);
}

// Performance is covered by an active plan, Recovery by a pack session left; Rehab is always charged offline.
function coverageOf(client: FakeClient, service: ServiceType, packLeft: number): SlotEligibility {
  const reasons: Record<ServiceType, () => SlotEligibility> = {
    performance: () =>
      client.subscriptions.performance?.status === "active"
        ? { covered: true, reason: null }
        : { covered: false, reason: "PLAN_REQUIRED" },
    recovery: () => (packLeft > 0 ? { covered: true, reason: null } : { covered: false, reason: "PACKAGE_REQUIRED" }),
    rehab: () => ({ covered: null, reason: "NOT_APPLICABLE" }),
  };
  return reasons[service]();
}

function spendPackSession(client: FakeClient): void {
  const pack = client.subscriptions.recoveryPacks.find((candidate) => candidate.sessionsLeft > 0);
  if (!pack) return;
  pack.sessionsLeft -= 1;
  pack.sessionsUsed += 1;
}

function toRow(detail: ClientDetail): ClientRow {
  return {
    id: detail.id,
    name: detail.name,
    lastName: detail.lastName,
    email: detail.email,
    phone: detail.phone,
    nextBookingAt: null,
    lastAttendanceStatus: null,
    deactivatedAt: detail.deactivation?.deactivatedAt ?? null,
  };
}

/** The charge as the backend sends it in a list: `slotStarted` as of now, without the records. */
function toListItem(charge: OfflineChargeDetailDto): OfflineChargeDto {
  return {
    id: charge.id,
    kind: "booking",
    planStartsOn: null,
    paysWith: null,
    client: charge.client,
    bookingId: charge.bookingId,
    service: charge.service,
    itemName: charge.itemName,
    booking: charge.booking,
    slotStarted: charge.booking ? isStarted(charge.booking.startsAt) : false,
    status: charge.status,
    paymentMethod: charge.paymentMethod,
    amount: charge.amount,
    currency: charge.currency,
    createdAt: charge.createdAt,
    bookedBy: charge.bookedBy,
    closedAt: charge.closedAt,
    closedBy: charge.closedBy,
    closeReason: charge.closeReason,
    needsAttention: charge.needsAttention,
    attentionReason: charge.attentionReason,
    attentionNote: charge.attentionNote,
    payment: charge.payment,
  };
}

function toDetail(charge: OfflineChargeDetailDto): OfflineChargeDetailDto {
  return { ...charge, slotStarted: charge.booking ? isStarted(charge.booking.startsAt) : false };
}

function toStaffPayment(charge: OfflineChargeDetailDto): StaffPaymentDto {
  return {
    purchaseId: charge.id,
    externalReference: charge.id,
    client: charge.client,
    kind: "booking",
    itemName: charge.itemName,
    service: charge.service,
    amount: charge.amount,
    currency: charge.currency,
    status: charge.status,
    needsAttention: charge.needsAttention,
    origin: "one_time",
    paymentMethod: charge.paymentMethod,
    createdAt: charge.createdAt,
    approvedAt: charge.payment?.recordedAt ?? null,
    planId: null,
    bookingId: charge.bookingId,
    attentionReason: charge.attentionReason,
    attentionNote: charge.attentionNote,
  };
}

function readReason(body: unknown, maxLength: number): string | null {
  const reason = readString(body, "reason")?.trim() ?? "";
  return reason.length > 0 && reason.length <= maxLength ? reason : null;
}

function readAmount(body: unknown): number | null {
  if (!isObject(body)) return null;
  const raw = body.amount;
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "";
  if (!AMOUNT_PATTERN.test(text)) return null;
  const amount = Number(text);
  return amount <= MAX_AMOUNT ? amount : null;
}

interface ReceiptInfo {
  size: number;
  type: string;
}

// The multipart body comes as plain fields plus `receipt: { name, size, type }` (see fake-api.ts).
function readReceipt(body: unknown): ReceiptInfo | null {
  if (!isObject(body) || !isObject(body.receipt)) return null;
  const { size, type } = body.receipt;
  return typeof size === "number" && typeof type === "string" ? { size, type } : null;
}

function paginate<T>(items: T[], url: URL): { items: T[]; page: number; pageSize: number } | null {
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) return null;
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize };
}

/**
 * Handles the staff booking and offline charge routes of the contract with a `staff-booking*` scenario, and the
 * client's paid offline charge with `offline-paid`. Any other staff scenario only gets an empty list of open
 * charges (the dashboard card, the record and attendance ask for it), and the receipt file itself is public.
 */
export function createOfflineChargesStore(): {
  handle(
    method: string,
    url: URL,
    scenario: string | null,
    body: unknown,
    owner?: string,
  ): Promise<FakeResponse | null>;
} {
  const states = new Map<string, OfflineState>();

  function stateOf(owner: string): OfflineState {
    const existing = states.get(owner);
    if (existing) return existing;
    const created = newState();
    states.set(owner, created);
    return created;
  }

  function findClient({ owner, params }: RequestContext): FakeClient | undefined {
    return stateOf(owner).clients.find((client) => client.detail.id === params[0]);
  }

  // The booking routes refuse a deactivated client like the backend's ActiveClientFinder.
  function activeClient(context: RequestContext): FakeClient | FakeResponse {
    const client = findClient(context);
    if (!client) return CLIENT_NOT_FOUND;
    return client.detail.deactivation ? ACCOUNT_DEACTIVATED : client;
  }

  function isResponse(value: FakeClient | FakeResponse): value is FakeResponse {
    return "status" in value;
  }

  function hasBooking(state: OfflineState, clientId: string, timeSlotId: string): boolean {
    return state.bookings.some(
      (booking) => booking.clientId === clientId && booking.timeSlotId === timeSlotId && booking.status === "confirmed",
    );
  }

  function openChargesOf(state: OfflineState, clientId: string): OfflineChargeDetailDto[] {
    return state.charges.filter((charge) => charge.client?.id === clientId && charge.status === "pending");
  }

  function findCharge({ owner, params }: RequestContext): OfflineChargeDetailDto | undefined {
    return stateOf(owner).charges.find((charge) => charge.id === params[0]);
  }

  function replaceCharge(owner: string, after: OfflineChargeDetailDto): OfflineChargeDetailDto {
    const state = stateOf(owner);
    state.charges = state.charges.map((charge) => (charge.id === after.id ? after : charge));
    return after;
  }

  // ----- Clients -----

  function listClients({ url, owner }: RequestContext): FakeResponse {
    const wantsDeactivated = url.searchParams.get("status") === "deactivated";
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const matching = stateOf(owner)
      .clients.map((client) => client.detail)
      .filter((detail) => (detail.deactivation !== null) === wantsDeactivated)
      .filter((detail) => `${fullNameOf(detail)} ${detail.email}`.toLowerCase().includes(query))
      .sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)));
    const paged = paginate(matching, url);
    if (!paged) return VALIDATION_FAILED;
    const body: ClientPage = { ...paged, items: paged.items.map(toRow), total: matching.length };
    return { status: 200, body };
  }

  function readClient(context: RequestContext): FakeResponse {
    const client = findClient(context);
    return client ? { status: 200, body: client.detail } : CLIENT_NOT_FOUND;
  }

  function readFollowup(context: RequestContext): FakeResponse {
    return findClient(context) ? { status: 200, body: { pause: null, pauses: [], contacts: [] } } : CLIENT_NOT_FOUND;
  }

  function readSubscriptions(context: RequestContext): FakeResponse {
    const client = activeClient(context);
    return isResponse(client) ? client : { status: 200, body: client.subscriptions };
  }

  function listClientSlots(context: RequestContext): FakeResponse {
    const client = activeClient(context);
    if (isResponse(client)) return client;
    const service = context.url.searchParams.get("service");
    const date = context.url.searchParams.get("date");
    if (!isOneOf(SERVICES, service) || date === null || !DATE_PATTERN.test(date)) return VALIDATION_FAILED;

    const state = stateOf(context.owner);
    const eligibility = coverageOf(client, service, packLeftOf(client));
    const slots = e2eSlotsFor(service, date).map((slot) => ({
      ...slot,
      alreadyBooked: hasBooking(state, client.detail.id, slot.id),
      eligibility,
    }));
    return { status: 200, body: slots };
  }

  function readTimeSlotIds(body: unknown): string[] | null {
    if (!isObject(body) || !Array.isArray(body.timeSlotIds)) return null;
    const ids = body.timeSlotIds;
    if (ids.length === 0 || ids.length > MAX_BATCH || new Set(ids).size !== ids.length) return null;
    return ids.every((id): id is string => typeof id === "string") ? ids : null;
  }

  // Same rule as booking: the pack's sessions are spent in the cart's order.
  function batchEligibility(context: RequestContext): FakeResponse {
    const client = activeClient(context);
    if (isResponse(client)) return client;
    const ids = readTimeSlotIds(context.body);
    if (!ids) return VALIDATION_FAILED;

    let packLeft = packLeftOf(client);
    const verdicts: StaffSlotEligibilityDto[] = [];
    for (const timeSlotId of ids) {
      const slot = parseSlotId(timeSlotId);
      if (!slot) return SLOT_NOT_FOUND;
      const coverage = coverageOf(client, slot.service, packLeft);
      if (slot.service === "recovery" && coverage.covered === true) packLeft -= 1;
      verdicts.push({ timeSlotId, ...coverage, chargedOffline: coverage.covered !== true });
    }
    return { status: 200, body: verdicts };
  }

  function allowance(context: RequestContext): FakeResponse {
    const client = activeClient(context);
    if (isResponse(client)) return client;
    const open = openChargesOf(stateOf(context.owner), client.detail.id).length;
    return { status: 200, body: { open, limit: OFFLINE_CHARGE_LIMIT, remaining: Math.max(0, OFFLINE_CHARGE_LIMIT - open) } };
  }

  interface BookingItem {
    timeSlotId: string;
    rehabKind: RehabKind;
  }

  // The amount is never accepted: the backend prices the charge (forbidNonWhitelisted answers 400).
  function readBookingItems(body: unknown): { paymentMethod: BookingPaymentChoice; items: BookingItem[] } | null {
    if (!isObject(body) || "amount" in body || !Array.isArray(body.items)) return null;
    const paymentMethod = body.paymentMethod ?? "undecided";
    if (!isOneOf(PAYMENT_CHOICES, paymentMethod)) return null;
    const rawItems: unknown[] = body.items;
    if (rawItems.length === 0 || rawItems.length > MAX_BATCH) return null;

    const items: BookingItem[] = [];
    for (const raw of rawItems) {
      if (!isObject(raw) || "amount" in raw || typeof raw.timeSlotId !== "string") return null;
      const rehabKind = raw.rehabKind ?? "evaluation";
      if (!isOneOf(REHAB_KIND_VALUES, rehabKind)) return null;
      items.push({ timeSlotId: raw.timeSlotId, rehabKind });
    }
    return new Set(items.map((item) => item.timeSlotId)).size === items.length ? { paymentMethod, items } : null;
  }

  function slotFailure(timeSlotId: string, code: SlotFailureCode) {
    return { timeSlotId, code, message: SLOT_FAILURES[code] };
  }

  function bookForClient(context: RequestContext): FakeResponse {
    const client = activeClient(context);
    if (isResponse(client)) return client;
    const input = readBookingItems(context.body);
    if (!input) return VALIDATION_FAILED;

    const state = stateOf(context.owner);
    const booked: StaffBookedDto[] = [];
    const failed: ReturnType<typeof slotFailure>[] = [];
    for (const item of input.items) {
      const slot = parseSlotId(item.timeSlotId);
      const startsAt = slot ? slotStartsAt(slot.date, slot.suffix) : null;
      if (!slot || !startsAt) {
        failed.push(slotFailure(item.timeSlotId, "SLOT_NOT_FOUND"));
        continue;
      }
      if (slot.suffix === SLOT_SUFFIX_FULL) {
        failed.push(slotFailure(item.timeSlotId, "SLOT_FULL"));
        continue;
      }
      if (isStarted(startsAt)) {
        failed.push(slotFailure(item.timeSlotId, "SLOT_NOT_BOOKABLE"));
        continue;
      }
      if (hasBooking(state, client.detail.id, item.timeSlotId)) {
        failed.push(slotFailure(item.timeSlotId, "ALREADY_BOOKED"));
        continue;
      }

      const coverage = coverageOf(client, slot.service, packLeftOf(client));
      const isCovered = coverage.covered === true;
      if (!isCovered && openChargesOf(state, client.detail.id).length >= OFFLINE_CHARGE_LIMIT) {
        failed.push(slotFailure(item.timeSlotId, "OFFLINE_CHARGE_LIMIT_REACHED"));
        continue;
      }

      const source: BookingSource = isCovered ? (slot.service === "recovery" ? "package" : "plan") : "staff_offline";
      const booking: FakeBooking = {
        id: `booking-${randomUUID()}`,
        clientId: client.detail.id,
        timeSlotId: item.timeSlotId,
        service: slot.service,
        startsAt,
        endsAt: endsAtOf(startsAt),
        status: "confirmed",
        source,
      };
      state.bookings = [...state.bookings, booking];
      if (isCovered && slot.service === "recovery") spendPackSession(client);

      const rehabKind = slot.service === "rehab" ? item.rehabKind : null;
      const charge = isCovered
        ? null
        : newCharge(`charge-${randomUUID()}`, client.detail, booking, {
            paymentMethod: input.paymentMethod,
            amount: priceFor(slot.service, rehabKind),
            itemName: rehabKind === "followup" ? REHAB_FOLLOWUP_NAME : ITEM_NAMES[slot.service],
            bookedBy: E2E_STAFF_PERSON,
            createdAt: new Date().toISOString(),
          });
      if (charge) state.charges = [...state.charges, charge];

      booked.push({
        bookingId: booking.id,
        timeSlotId: booking.timeSlotId,
        service: booking.service,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        label: rehabKind ? REHAB_KIND_LABELS[rehabKind] : "Reserva confirmada",
        source: isCovered ? (source === "package" ? "package" : "plan") : "staff_offline",
        rehabKind,
        offlineCharge: charge
          ? { id: charge.id, status: "pending", paymentMethod: charge.paymentMethod, amount: charge.amount, currency: "UYU" }
          : null,
      });
    }
    return { status: 200, body: { booked, failed } };
  }

  function readSettings(): FakeResponse {
    return { status: 200, body: STAFF_SETTINGS };
  }

  function bookingWindow(): FakeResponse {
    return {
      status: 200,
      body: { bookingWindowDays: BOOKING_WINDOW_DAYS, lastBookableDate: businessDateFromToday(BOOKING_WINDOW_DAYS) },
    };
  }

  // ----- Offline charges -----

  // Only the open ones (`overdue` and `today` narrow them); the started slots first (oldest first), then the future ones (closest first).
  function listCharges({ url, owner }: RequestContext): FakeResponse {
    const clientId = url.searchParams.get("clientId");
    const rawBookingIds = url.searchParams.get("bookingIds");
    const bookingIds = rawBookingIds === null ? null : rawBookingIds.split(",").filter(Boolean);
    if (bookingIds && bookingIds.length > MAX_BOOKING_IDS) return VALIDATION_FAILED;
    const overdueOnly = url.searchParams.get("overdue") === "true";
    const rawToday = url.searchParams.get("today");
    // Like the back: only true/false are booleans; anything else is a 400.
    if (rawToday !== null && rawToday !== "true" && rawToday !== "false") return VALIDATION_FAILED;
    const todayOnly = rawToday === "true";
    const today = businessDateFromToday(0);

    const items = stateOf(owner)
      .charges.filter((charge) => charge.status === "pending")
      .filter((charge) => clientId === null || charge.client?.id === clientId)
      .filter((charge) => bookingIds === null || (charge.bookingId !== null && bookingIds.includes(charge.bookingId)))
      // Overdue: the slot was on an earlier day. A charge without a slot is never overdue.
      .filter((charge) => !overdueOnly || (charge.booking !== null && businessDateOf(charge.booking.startsAt) < today))
      // Today: the slot is on today's date. The two filters are disjoint, so both together give nothing.
      .filter(
        (charge) =>
          !todayOnly ||
          (!overdueOnly && charge.booking !== null && businessDateOf(charge.booking.startsAt) === today),
      )
      .sort((a, b) => (a.booking?.startsAt ?? "9999").localeCompare(b.booking?.startsAt ?? "9999"))
      .map(toListItem);
    const body: OfflineChargeListDto = { items, total: items.length, limitPerClient: OFFLINE_CHARGE_LIMIT };
    return { status: 200, body };
  }

  function receiptUpload({ scenario }: RequestContext): FakeResponse {
    return {
      status: 200,
      body: { available: scenario !== SCENARIO_NO_STORAGE, maxBytes: RECEIPT_MAX_BYTES, allowedTypes: RECEIPT_TYPES },
    };
  }

  function readCharge(context: RequestContext): FakeResponse {
    const charge = findCharge(context);
    return charge ? { status: 200, body: toDetail(charge) } : CHARGE_NOT_FOUND;
  }

  function recordPayment(context: RequestContext): FakeResponse {
    const charge = findCharge(context);
    if (!charge) return CHARGE_NOT_FOUND;
    const { body } = context;
    const method = isObject(body) ? body.method : null;
    const amount = readAmount(body);
    const paidOn = readString(body, "paidOn");
    const note = readString(body, "note")?.trim() ?? "";
    if (!isOneOf(OFFLINE_METHODS, method) || amount === null || paidOn === null || !DATE_PATTERN.test(paidOn)) {
      return VALIDATION_FAILED;
    }
    if (note.length > NOTE_MAX_LENGTH) return VALIDATION_FAILED;
    if (paidOn > businessDateFromToday(0)) return DATE_IN_FUTURE;
    if (paidOn < businessDateFromToday(-MAX_PAYMENT_DAYS_BACK)) return DATE_TOO_OLD;
    if (charge.status !== "pending") return CHARGE_NOT_OPEN;

    const receipt = readReceipt(body);
    if (receipt && context.scenario === SCENARIO_NO_STORAGE) return UPLOAD_UNAVAILABLE;
    if (receipt && receipt.size > RECEIPT_MAX_BYTES) return RECEIPT_TOO_LARGE;
    if (receipt && !RECEIPT_TYPES.includes(receipt.type)) return RECEIPT_TYPE_NOT_ALLOWED;

    const record: OfflinePaymentDto = {
      id: `payment-${randomUUID()}`,
      method,
      amount,
      currency: "UYU",
      paidOn,
      note: note || null,
      hasReceipt: receipt !== null,
      recordedAt: new Date().toISOString(),
      recordedBy: E2E_STAFF_PERSON,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
    };
    const after = replaceCharge(context.owner, {
      ...charge,
      status: "approved",
      paymentMethod: method,
      amount,
      payment: record,
      payments: [record, ...charge.payments],
    });
    return { status: 200, body: toDetail(after) };
  }

  function waiveCharge(context: RequestContext): FakeResponse {
    const charge = findCharge(context);
    if (!charge) return CHARGE_NOT_FOUND;
    const reason = readReason(context.body, REASON_MAX_LENGTH);
    if (!reason) return VALIDATION_FAILED;
    if (charge.status !== "pending") return CHARGE_NOT_OPEN;
    if (!charge.booking || !isStarted(charge.booking.startsAt)) return SLOT_NOT_STARTED;

    const after = replaceCharge(context.owner, {
      ...charge,
      status: "waived",
      closedAt: new Date().toISOString(),
      closedBy: E2E_STAFF_PERSON,
      closeReason: reason,
    });
    return { status: 200, body: toDetail(after) };
  }

  function receiptLink(origin: string, paymentId: string): FakeResponse {
    return {
      status: 200,
      body: {
        url: `${origin}/files/fake-${paymentId}`,
        expiresAt: new Date(Date.now() + RECEIPT_LINK_TTL_MS).toISOString(),
      },
    };
  }

  function staffReceipt(context: RequestContext): FakeResponse {
    if (context.scenario === SCENARIO_NO_STORAGE) return UPLOAD_UNAVAILABLE;
    const charge = findCharge(context);
    const payment = charge?.payments.find((candidate) => candidate.id === context.params[1]);
    return payment?.hasReceipt ? receiptLink(context.url.origin, payment.id) : RECEIPT_NOT_FOUND;
  }

  // GET /staff/payments: the charges in every state, as the payments table shows them.
  function listStaffPayments({ url, owner }: RequestContext): FakeResponse {
    const status = url.searchParams.get("status");
    const clientId = url.searchParams.get("clientId");
    const needsAttention = url.searchParams.get("needsAttention") === "true";
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const matching = stateOf(owner)
      .charges.filter((charge) => status === null || charge.status === status)
      .filter((charge) => clientId === null || charge.client?.id === clientId)
      .filter((charge) => !needsAttention || charge.needsAttention)
      .filter((charge) => `${charge.client?.name ?? ""} ${charge.client?.email ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toStaffPayment);
    const paged = paginate(matching, url);
    if (!paged) return VALIDATION_FAILED;
    const body: StaffPaymentPageDto = { ...paged, total: matching.length };
    return { status: 200, body };
  }

  // ----- Attendance -----

  function dailySlot(state: OfflineState, timeSlotId: string): DailySlot | null {
    const parsed = parseSlotId(timeSlotId);
    const slot = parsed ? e2eSlotsFor(parsed.service, parsed.date).find((candidate) => candidate.id === timeSlotId) : null;
    if (!slot) return null;
    const confirmed = state.bookings.filter((booking) => booking.timeSlotId === timeSlotId && booking.status === "confirmed");
    return {
      id: slot.id,
      service: slot.service,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: slot.capacity,
      booked: confirmed.length,
      professionalName: null,
      calendarBlockedAt: null,
      cancelledAt: null,
      cancelReason: null,
      staffEditedAt: null,
      isIndividual: false,
      templateProfessionalName: null,
      unmarkedAttendance: confirmed.length,
    };
  }

  function listDailySlots({ url, owner }: RequestContext): FakeResponse {
    const date = url.searchParams.get("date");
    if (date === null || !DATE_PATTERN.test(date)) return VALIDATION_FAILED;
    const state = stateOf(owner);
    const slots = SERVICES.flatMap((service) => e2eSlotsFor(service, date))
      .map((slot) => dailySlot(state, slot.id))
      .filter((slot): slot is DailySlot => slot !== null)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { status: 200, body: slots };
  }

  function readDailySlot({ owner, params }: RequestContext): FakeResponse {
    const slot = dailySlot(stateOf(owner), params[0]);
    return slot ? { status: 200, body: slot } : SLOT_NOT_FOUND;
  }

  function readRoster({ owner, params }: RequestContext): FakeResponse {
    const state = stateOf(owner);
    if (!parseSlotId(params[0])) return SLOT_NOT_FOUND;
    const roster: RosterItem[] = state.bookings
      .filter((booking) => booking.timeSlotId === params[0])
      .flatMap((booking) => {
        const client = state.clients.find((candidate) => candidate.detail.id === booking.clientId)?.detail;
        if (!client) return [];
        return [
          {
            bookingId: booking.id,
            client: { id: client.id, name: client.name, lastName: client.lastName },
            status: booking.status,
            attendance: null,
            source: booking.source,
          },
        ];
      });
    return { status: 200, body: roster };
  }

  // A pending charge closes with the booking; a paid one stays approved and waits in Pagos for review.
  function cancelBooking(context: RequestContext): FakeResponse {
    const state = stateOf(context.owner);
    const booking = state.bookings.find((candidate) => candidate.id === context.params[0]);
    if (!booking) return BOOKING_NOT_FOUND;
    if (!readReason(context.body, CANCEL_REASON_MAX_LENGTH)) return VALIDATION_FAILED;
    if (booking.status !== "confirmed" || isStarted(booking.startsAt)) return BOOKING_NOT_CANCELLABLE;

    state.bookings = state.bookings.map((candidate) =>
      candidate.id === booking.id ? { ...candidate, status: "cancelled" } : candidate,
    );
    const charge = state.charges.find((candidate) => candidate.bookingId === booking.id);
    const outcome = charge ? closeChargeOfCancelled(context.owner, charge) : nonOfflineOutcome(booking);
    const body: CancelBookingResultDto = { bookingId: booking.id, paymentOutcome: outcome };
    return { status: 200, body };
  }

  function nonOfflineOutcome(booking: FakeBooking): CancellationPaymentOutcome {
    return booking.source === "package" ? "session_returned" : "nothing_consumed";
  }

  function closeChargeOfCancelled(owner: string, charge: OfflineChargeDetailDto): CancellationPaymentOutcome {
    const booking = charge.booking ? { ...charge.booking, status: "cancelled" as const } : null;
    if (charge.status === "approved") {
      replaceCharge(owner, {
        ...charge,
        booking,
        needsAttention: true,
        attentionReason: "offline_booking_cancelled",
        attentionNote: null,
      });
      return "offline_charge_paid";
    }
    replaceCharge(owner, {
      ...charge,
      booking,
      status: charge.status === "pending" ? "cancelled" : charge.status,
      closedAt: charge.status === "pending" ? new Date().toISOString() : charge.closedAt,
    });
    return "offline_charge";
  }

  // ----- The client (offline-paid) -----

  function listMyPayments({ url }: RequestContext): FakeResponse {
    const origin = url.searchParams.get("origin");
    if (origin !== null && origin !== "one_time" && origin !== "auto_debit") return VALIDATION_FAILED;
    const matching = OFFLINE_PAID_PAYMENTS.filter((payment) => origin === null || payment.origin === origin);
    const paged = paginate(matching, url);
    if (!paged) return VALIDATION_FAILED;
    const body: MyPaymentPageDto = { ...paged, total: matching.length };
    return { status: 200, body };
  }

  function myReceipt({ url, params }: RequestContext): FakeResponse {
    const payment = OFFLINE_PAID_PAYMENTS.find((candidate) => candidate.id === params[0]);
    const hasReceipt = payment !== undefined && payment.paymentMethod !== "mercado_pago" && payment.hasReceipt;
    return hasReceipt ? receiptLink(url.origin, payment.id) : RECEIPT_NOT_FOUND;
  }

  const staffRoutes: Route[] = [
    { method: "GET", pattern: /^\/staff\/clients$/, respond: listClients },
    { method: "GET", pattern: /^\/staff\/clients\/([^/]+)$/, respond: readClient },
    { method: "GET", pattern: /^\/staff\/clients\/([^/]+)\/followup$/, respond: readFollowup },
    { method: "GET", pattern: /^\/staff\/clients\/([^/]+)\/subscriptions$/, respond: readSubscriptions },
    { method: "GET", pattern: /^\/staff\/clients\/([^/]+)\/slots$/, respond: listClientSlots },
    { method: "POST", pattern: /^\/staff\/clients\/([^/]+)\/batch-eligibility$/, respond: batchEligibility },
    { method: "POST", pattern: /^\/staff\/clients\/([^/]+)\/bookings$/, respond: bookForClient },
    { method: "GET", pattern: /^\/staff\/clients\/([^/]+)\/offline-charge-allowance$/, respond: allowance },
    { method: "GET", pattern: /^\/bookings\/window$/, respond: bookingWindow },
    { method: "GET", pattern: /^\/staff\/settings$/, respond: readSettings },
    { method: "GET", pattern: /^\/staff\/offline-charges$/, respond: listCharges },
    { method: "GET", pattern: /^\/staff\/offline-charges\/receipt-upload$/, respond: receiptUpload },
    { method: "GET", pattern: /^\/staff\/offline-charges\/([^/]+)$/, respond: readCharge },
    { method: "POST", pattern: /^\/staff\/offline-charges\/([^/]+)\/payment$/, respond: recordPayment },
    { method: "POST", pattern: /^\/staff\/offline-charges\/([^/]+)\/waive$/, respond: waiveCharge },
    {
      method: "GET",
      pattern: /^\/staff\/offline-charges\/([^/]+)\/payments\/([^/]+)\/receipt$/,
      respond: staffReceipt,
    },
    { method: "GET", pattern: /^\/staff\/payments$/, respond: listStaffPayments },
    { method: "GET", pattern: /^\/staff\/time-slots$/, respond: listDailySlots },
    { method: "GET", pattern: /^\/staff\/time-slots\/([^/]+)$/, respond: readDailySlot },
    { method: "GET", pattern: /^\/staff\/time-slots\/([^/]+)\/roster$/, respond: readRoster },
    { method: "POST", pattern: /^\/staff\/bookings\/([^/]+)\/cancel$/, respond: cancelBooking },
  ];

  const clientRoutes: Route[] = [
    { method: "GET", pattern: /^\/me\/payments$/, respond: listMyPayments },
    { method: "GET", pattern: /^\/me\/payments\/([^/]+)\/receipt$/, respond: myReceipt },
  ];

  function route(routes: Route[], method: string, path: string, context: Omit<RequestContext, "params">) {
    for (const candidate of routes) {
      const match = candidate.pattern.exec(path);
      if (candidate.method !== method || !match) continue;
      return candidate.respond({ ...context, params: match.slice(1).map(decodeURIComponent) });
    }
    return null;
  }

  return {
    async handle(method, url, scenario, body, owner = DEFAULT_OWNER) {
      // The signed link opens in a new tab, like the backend's local storage: public, only the token matters.
      const file = FILE_PATTERN.exec(url.pathname);
      if (method === "GET" && file) return { status: 200, body: TINY_PNG };
      if (method === "GET" && url.pathname.startsWith("/files/")) return NOT_FOUND;

      if (!url.pathname.startsWith(`${API_PREFIX}/`)) return null;
      const path = url.pathname.slice(API_PREFIX.length);
      if (scenario === null) return null;

      const context = { url, scenario, owner, body };
      if (OFFLINE_PAID_SCENARIOS.includes(scenario)) return route(clientRoutes, method, path, context);
      if (isStaffBookingScenario(scenario)) return route(staffRoutes, method, path, context);
      // Any other staff scenario has no charges: the dashboard card, the record and attendance load empty.
      if (isStaffScenario(scenario) && method === "GET" && path === "/staff/offline-charges") {
        const empty: OfflineChargeListDto = { items: [], total: 0, limitPerClient: OFFLINE_CHARGE_LIMIT };
        return { status: 200, body: empty };
      }
      return null;
    },
  };
}

