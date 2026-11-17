import { addDaysToDate } from "@/features/bookings/slots";
import type { OfflineChargeDto, OfflinePaymentMethod } from "@/lib/api/types";

import { formatAmountInput, parseOfflineAmount } from "./offline-amount";
import type { RecordOfflinePaymentInput } from "./offline-charges-api";

export const RECEIPT_MAX_BYTES = 1 * 1024 * 1024;
export const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
export const NOTE_MAX_LENGTH = 280;
// How far back staff can date a payment, so a closed month is not changed by a late entry.
export const MAX_PAYMENT_DAYS_BACK = 30;

export const RECEIPT_TOO_BIG_ERROR = "El comprobante no puede pesar más de 1 MB.";
export const RECEIPT_TYPE_ERROR = "El comprobante tiene que ser una foto (JPG, PNG, WEBP o HEIC) o un PDF.";
export const FUTURE_DATE_ERROR = "La fecha del pago no puede ser futura.";
export const TOO_OLD_DATE_ERROR = `La fecha no puede ser de hace más de ${MAX_PAYMENT_DAYS_BACK} días.`;

const ACCEPTED_TYPES = RECEIPT_ACCEPT.split(",");

export interface RecordPaymentValues {
  method: OfflinePaymentMethod | null;
  amount: string;
  paidOn: string;
  note: string;
  receipt: File | null;
}

type FieldErrors = Partial<Record<keyof RecordPaymentValues, string>>;

export type RecordPaymentResult =
  | { ok: true; input: RecordOfflinePaymentInput }
  | { ok: false; errors: FieldErrors };

// Chrome does not know the HEIC type and leaves it empty; the backend decides by the content.
function isAcceptedType(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  return file.type === "" && file.name.toLowerCase().endsWith(".heic");
}

function receiptError(file: File): string | undefined {
  if (file.size > RECEIPT_MAX_BYTES) return RECEIPT_TOO_BIG_ERROR;
  if (!isAcceptedType(file)) return RECEIPT_TYPE_ERROR;
  return undefined;
}

/** The oldest date a payment can have (YYYY-MM-DD), given today's business date. */
export function earliestPaymentDate(today: string): string {
  return addDaysToDate(today, -MAX_PAYMENT_DAYS_BACK);
}

function dateError(paidOn: string, today: string): string | undefined {
  if (!paidOn) return "Elegí la fecha del pago.";
  if (paidOn > today) return FUTURE_DATE_ERROR;
  return paidOn < earliestPaymentDate(today) ? TOO_OLD_DATE_ERROR : undefined;
}

export function parseRecordPayment(values: RecordPaymentValues, today: string): RecordPaymentResult {
  const errors: FieldErrors = {};
  if (!values.method) errors.method = "Elegí cómo pagó.";

  const amount = parseOfflineAmount(values.amount, true);
  if (!amount.ok) errors.amount = amount.error;

  const paidOnError = dateError(values.paidOn, today);
  if (paidOnError) errors.paidOn = paidOnError;

  const note = values.note.trim();
  if (note.length > NOTE_MAX_LENGTH) errors.note = `Máximo ${NOTE_MAX_LENGTH} caracteres.`;

  const fileError = values.receipt ? receiptError(values.receipt) : undefined;
  if (fileError) errors.receipt = fileError;

  if (Object.keys(errors).length > 0 || !values.method || !amount.ok || amount.value === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      method: values.method,
      amount: amount.value,
      paidOn: values.paidOn,
      note: note || null,
      receipt: values.receipt,
    },
  };
}

export function initialRecordPaymentValues(charge: OfflineChargeDto, today: string): RecordPaymentValues {
  return {
    method: charge.paymentMethod === "cash" || charge.paymentMethod === "transfer" ? charge.paymentMethod : null,
    amount: charge.amount === null ? "" : formatAmountInput(charge.amount),
    paidOn: today,
    note: "",
    receipt: null,
  };
}
