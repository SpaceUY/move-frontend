// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { OfflineChargeDto } from "@/lib/api/types";

import {
  NOTE_MAX_LENGTH,
  RECEIPT_ACCEPT,
  RECEIPT_MAX_BYTES,
  earliestPaymentDate,
  initialRecordPaymentValues,
  parseRecordPayment,
  type RecordPaymentValues,
} from "./record-payment-schema";

const TODAY = "2026-11-02";
const VALID: RecordPaymentValues = {
  method: "cash",
  amount: "900",
  paidOn: TODAY,
  note: "",
  receipt: null,
};

describe("parseRecordPayment", () => {
  it("accepts and normalizes", () => {
    const result = parseRecordPayment({ ...VALID, method: "transfer", amount: "1.200", note: "  " }, TODAY);

    expect(result).toEqual({
      ok: true,
      input: { method: "transfer", amount: 1200, paidOn: TODAY, note: null, receipt: null },
    });
  });

  it("trims a note and keeps the receipt", () => {
    const receipt = new File(["x"], "c.pdf", { type: "application/pdf" });

    const result = parseRecordPayment({ ...VALID, note: " De la madre ", receipt }, TODAY);

    expect(result).toEqual({
      ok: true,
      input: { method: "cash", amount: 900, paidOn: TODAY, note: "De la madre", receipt },
    });
  });

  it.each<[string, Partial<RecordPaymentValues>, Partial<Record<keyof RecordPaymentValues, string>>]>([
    ["no method", { method: null }, { method: "Elegí cómo pagó." }],
    ["an empty amount", { amount: "" }, { amount: "Ingresá el monto que pagó." }],
    ["an empty date", { paidOn: "" }, { paidOn: "Elegí la fecha del pago." }],
    ["a future date", { paidOn: "2026-11-03" }, { paidOn: "La fecha del pago no puede ser futura." }],
    ["a long note", { note: "a".repeat(NOTE_MAX_LENGTH + 1) }, { note: "Máximo 280 caracteres." }],
    [
      "a big receipt",
      { receipt: new File([new Uint8Array(RECEIPT_MAX_BYTES + 1)], "c.pdf", { type: "application/pdf" }) },
      { receipt: "El comprobante no puede pesar más de 1 MB." },
    ],
    [
      "a foreign receipt",
      { receipt: new File(["x"], "c.txt", { type: "text/plain" }) },
      { receipt: "El comprobante tiene que ser una foto (JPG, PNG, WEBP o HEIC) o un PDF." },
    ],
  ])("rejects %s", (_name, change, errors) => {
    expect(parseRecordPayment({ ...VALID, ...change }, TODAY)).toEqual({ ok: false, errors });
  });

  it("rejects a date 31 days back", () => {
    const result = parseRecordPayment({ ...VALID, paidOn: "2026-10-03" }, "2026-11-03");

    expect(result).toEqual({ ok: false, errors: { paidOn: "La fecha no puede ser de hace más de 30 días." } });
  });

  it("accepts exactly 30 days back", () => {
    expect(parseRecordPayment({ ...VALID, paidOn: "2026-10-04" }, "2026-11-03").ok).toBe(true);
  });

  it("counts the 30 days across a month change", () => {
    expect(earliestPaymentDate("2026-11-03")).toBe("2026-10-04");
    expect(earliestPaymentDate("2026-03-05")).toBe("2026-02-03");
  });

  it("accepts a note of exactly 280", () => {
    expect(parseRecordPayment({ ...VALID, note: "a".repeat(NOTE_MAX_LENGTH) }, TODAY).ok).toBe(true);
  });

  it("accepts a HEIC with an empty type", () => {
    const receipt = new File(["x"], "foto.HEIC", { type: "" });

    expect(parseRecordPayment({ ...VALID, receipt }, TODAY).ok).toBe(true);
  });

  it("fixes the limit at 1 MB", () => {
    expect(RECEIPT_MAX_BYTES).toBe(1024 * 1024);
  });

  it("accepts a file of exactly 1 MB", () => {
    const receipt = new File([new Uint8Array(RECEIPT_MAX_BYTES)], "c.png", { type: "image/png" });

    expect(parseRecordPayment({ ...VALID, receipt }, TODAY).ok).toBe(true);
  });

  it("accepts the listed types", () => {
    expect(RECEIPT_ACCEPT).toBe("image/jpeg,image/png,image/webp,image/heic,application/pdf");
  });
});

describe("initialRecordPaymentValues", () => {
  const charge = (paymentMethod: OfflineChargeDto["paymentMethod"], amount: number | null) =>
    ({ paymentMethod, amount }) as OfflineChargeDto;

  it("takes the method and amount of the charge", () => {
    expect(initialRecordPaymentValues(charge("cash", 900), TODAY)).toEqual({
      method: "cash",
      amount: "900",
      paidOn: TODAY,
      note: "",
      receipt: null,
    });
  });

  it("leaves the method and amount empty for an undecided charge without amount", () => {
    expect(initialRecordPaymentValues(charge("undecided", null), TODAY)).toEqual({
      method: null,
      amount: "",
      paidOn: TODAY,
      note: "",
      receipt: null,
    });
  });
});
