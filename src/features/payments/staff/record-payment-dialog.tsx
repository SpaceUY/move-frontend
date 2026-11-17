"use client";

import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { controlClass, describedBy, Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control";
import { useSnackbar } from "@/components/ui/snackbar";
import { Textarea } from "@/components/ui/textarea";
import { todayBusinessDate } from "@/features/bookings/slots";
import { ApiError } from "@/lib/api/errors";
import type { OfflineChargeDetailDto, OfflineChargeDto, OfflinePaymentMethod } from "@/lib/api/types";

import {
  NON_JSON_CODE,
  OFFLINE_ERROR_CODES,
  offlineChargeSubtitle,
  planNoun,
  offlineChargeTitle,
  offlineErrorCode,
  offlineErrorMessage,
  PAYMENT_METHOD_LABELS,
} from "./offline-charge-labels";
import { getReceiptUpload, recordOfflinePayment } from "./offline-charges-api";
import {
  earliestPaymentDate,
  FUTURE_DATE_ERROR,
  initialRecordPaymentValues,
  NOTE_MAX_LENGTH,
  parseRecordPayment,
  RECEIPT_ACCEPT,
  RECEIPT_TOO_BIG_ERROR,
  RECEIPT_TYPE_ERROR,
  type RecordPaymentValues,
  TOO_OLD_DATE_ERROR,
} from "./record-payment-schema";

type FieldErrors = Partial<Record<keyof RecordPaymentValues, string>>;
// The control has no "nothing chosen" option, so an empty method is the empty string.
type MethodChoice = OfflinePaymentMethod | "";

const METHOD_LABEL = "Medio de pago";
const METHOD_OPTIONS: readonly SegmentedControlOption<MethodChoice>[] = [
  { value: "cash", label: PAYMENT_METHOD_LABELS.cash },
  { value: "transfer", label: PAYMENT_METHOD_LABELS.transfer },
];
const RECEIPT_HELP = "Foto o PDF, máximo 1 MB.";
const RECEIPT_UNAVAILABLE = "Adjuntar comprobante no está disponible todavía.";
const RECORDED_MESSAGE = "Pago registrado.";
const RECORD_FAILED_MESSAGE = "No pudimos registrar el pago. Probá de nuevo.";
const NOT_OPEN_FALLBACK = "El cobro ya no está abierto.";

const FILE_CLASS =
  "file:mr-3 file:rounded file:border-0 file:bg-card file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white";

export interface RecordPaymentDialogProps {
  charge: OfflineChargeDto;
  onRecorded(detail: OfflineChargeDetailDto): void;
  /** The charge changed under staff's feet (it is no longer open): reload what is on screen. */
  onStale(): void;
  onClose(): void;
}

export function RecordPaymentDialog({ charge, onRecorded, onStale, onClose }: RecordPaymentDialogProps) {
  const { showSnackbar } = useSnackbar();
  const [today] = useState(todayBusinessDate);
  const [values, setValues] = useState<RecordPaymentValues>(() => initialRecordPaymentValues(charge, today));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  // null while it loads; a failed check counts as storage off.
  const [uploadAvailable, setUploadAvailable] = useState<boolean | null>(null);
  const submitting = useRef(false);
  const receiptInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getReceiptUpload()
      .then((upload) => {
        if (!cancelled) setUploadAvailable(upload.available);
      })
      .catch(() => {
        if (!cancelled) setUploadAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setField<K extends keyof RecordPaymentValues>(field: K, value: RecordPaymentValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function dropReceipt() {
    if (receiptInput.current) receiptInput.current.value = "";
    setValues((current) => ({ ...current, receipt: null }));
  }

  // The rejections that belong to a field go under it; the dialog stays open with everything typed.
  // A proxy can answer 413/415 without JSON (code UNKNOWN): then the HTTP status decides.
  function fieldErrorOf(failure: unknown): FieldErrors | null {
    const code = offlineErrorCode(failure);
    const status = failure instanceof ApiError ? failure.body.statusCode : null;
    const byStatus = code === NON_JSON_CODE;
    if (code === OFFLINE_ERROR_CODES.TOO_LARGE || (byStatus && status === 413)) {
      return { receipt: RECEIPT_TOO_BIG_ERROR };
    }
    if (code === OFFLINE_ERROR_CODES.TYPE_NOT_ALLOWED || (byStatus && status === 415)) {
      return { receipt: RECEIPT_TYPE_ERROR };
    }
    if (code === OFFLINE_ERROR_CODES.DATE_IN_FUTURE) return { paidOn: FUTURE_DATE_ERROR };
    if (code === OFFLINE_ERROR_CODES.DATE_TOO_OLD) return { paidOn: TOO_OLD_DATE_ERROR };
    return null;
  }

  function handleFailure(failure: unknown) {
    const code = offlineErrorCode(failure);
    if (code === OFFLINE_ERROR_CODES.NOT_OPEN) {
      showSnackbar({ tone: "info", title: offlineErrorMessage(failure, NOT_OPEN_FALLBACK) });
      onStale();
      onClose();
      return;
    }
    submitting.current = false;
    setIsSaving(false);
    const fieldError = fieldErrorOf(failure);
    if (fieldError) {
      setErrors(fieldError);
      return;
    }
    if (code === OFFLINE_ERROR_CODES.UPLOAD_UNAVAILABLE) {
      setUploadAvailable(false);
      dropReceipt();
      // Staff must notice the payment would be recorded without the receipt they chose.
      showSnackbar({ tone: "info", title: offlineErrorMessage(failure, RECEIPT_UNAVAILABLE) });
      return;
    }
    showSnackbar({ tone: "danger", title: offlineErrorMessage(failure, RECORD_FAILED_MESSAGE) });
  }

  async function confirm() {
    if (submitting.current) return;
    const result = parseRecordPayment(values, today);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    submitting.current = true;
    setErrors({});
    setIsSaving(true);
    try {
      const detail = await recordOfflinePayment(charge.id, result.input);
      showSnackbar({ tone: "success", title: RECORDED_MESSAGE });
      onRecorded(detail);
    } catch (failure) {
      handleFailure(failure);
    }
  }

  const receiptDisabled = uploadAvailable !== true;
  const receiptId = "record-payment-receipt";
  const receiptHelpId = `${receiptId}-help`;

  return (
    <ConfirmDialog
      title={`Registrar pago · ${charge.client?.name ?? "Cliente"}`}
      confirmLabel="Confirmar pago"
      isBusy={isSaving}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      <p className="mt-1 text-sm text-muted">{offlineChargeTitle(charge)}</p>
      {charge.paysWith ? (
        <>
          <p className="text-sm text-muted">{offlineChargeSubtitle(charge)}</p>
          <p className="text-sm text-muted">Al registrarlo se cierra el {planNoun(charge.service)} y todos sus turnos.</p>
        </>
      ) : null}
      <div className="mt-5 space-y-4">
        <div>
          <span className="text-xs font-medium text-muted">{METHOD_LABEL}</span>
          <SegmentedControl<MethodChoice>
            aria-label={METHOD_LABEL}
            className="mt-2"
            options={METHOD_OPTIONS}
            value={values.method ?? ""}
            onChange={(method) => method && setField("method", method)}
          />
          {errors.method ? <FieldError id="record-payment-method-error">{errors.method}</FieldError> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Monto"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            value={values.amount}
            onChange={(event) => setField("amount", event.target.value)}
            error={errors.amount}
          />
          <Input
            label="Fecha del pago"
            name="paidOn"
            type="date"
            min={earliestPaymentDate(today)}
            max={today}
            value={values.paidOn}
            onChange={(event) => setField("paidOn", event.target.value)}
            error={errors.paidOn}
          />
        </div>
        <Field id={receiptId} label="Comprobante (opcional)" error={errors.receipt}>
          <input
            ref={receiptInput}
            id={receiptId}
            name="receipt"
            type="file"
            accept={RECEIPT_ACCEPT}
            disabled={receiptDisabled}
            aria-invalid={Boolean(errors.receipt)}
            aria-describedby={describedBy(receiptId, errors.receipt, receiptHelpId)}
            className={controlClass(errors.receipt, FILE_CLASS)}
            onChange={(event) => setField("receipt", event.target.files?.[0] ?? null)}
          />
          <p id={receiptHelpId} className="mt-1.5 text-xs text-muted">
            {uploadAvailable === false ? RECEIPT_UNAVAILABLE : RECEIPT_HELP}
          </p>
        </Field>
        <Textarea
          label="Nota (opcional)"
          name="note"
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Ej.: transferencia desde la cuenta de la madre"
          value={values.note}
          onChange={(event) => setField("note", event.target.value)}
          error={errors.note}
        />
      </div>
    </ConfirmDialog>
  );
}
