"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useErrorSnackbar, useSnackbar } from "@/components/ui/snackbar";
// By path: the subscriptions index also exports server-only code (next/headers).
import { formatBusinessDate } from "@/features/subscriptions/present-subscriptions";
import type { AutoDebitDto } from "@/lib/api/types";
import { cn } from "@/lib/cn";

import { type AutoDebitLineTone, presentAutoDebitLine } from "./present-auto-debit";
import { useMyAutoDebits } from "./use-my-auto-debits";

const CANCELLED_TITLE = "Débito automático cancelado.";

const DOT_CLASSES: Record<AutoDebitLineTone, string> = {
  active: "bg-success ring-success/15",
  pending: "bg-warning ring-warning/15",
};

type CancelState =
  | { phase: "idle" }
  | { phase: "confirming" }
  | { phase: "cancelling" }
  | { phase: "failed"; message: string }
  | { phase: "cancelled" };

function validityText(paidUntil: string | null): string {
  if (paidUntil === null) return "Lo que ya pagaste sigue vigente.";
  return `Lo que ya pagaste sigue vigente hasta el ${formatBusinessDate(paidUntil)}.`;
}

function CancelConfirmation({
  paidUntil,
  state,
  onBack,
  onConfirm,
}: {
  paidUntil: string | null;
  state: CancelState;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const isCancelling = state.phase === "cancelling";

  // The confirmation opens where the "Cancelar débito" button was, so focus moves into it (on "Volver", the safe choice).
  useEffect(() => {
    groupRef.current?.querySelector("button")?.focus();
  }, []);

  return (
    <div ref={groupRef} role="group" aria-label="Cancelar débito automático" className="mt-3 rounded border border-line p-4">
      <p className="text-sm font-medium">¿Cancelar el débito automático?</p>
      <p className="mt-1 text-xs text-muted">{validityText(paidUntil)}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant="secondary" disabled={isCancelling} onClick={onBack} touchTarget>
          Volver
        </Button>
        <Button type="button" disabled={isCancelling} onClick={onConfirm} touchTarget>
          {isCancelling ? "Cancelando…" : "Sí, cancelar débito"}
        </Button>
      </div>
    </div>
  );
}

// Inside a plan card the row hangs under a divider; with no plan card around it, it is a card of its own.
function Frame({ standalone, children }: { standalone: boolean; children: ReactNode }) {
  if (standalone) return <Card padding="sm">{children}</Card>;
  return <div className="mt-6 border-t border-line pt-5">{children}</div>;
}

/**
 * The automatic debit of one service inside its card in "Mi plan", with its inline cancellation.
 * It reads the debits itself: this is a client component, so the server section does not wait for it.
 */
export function AutoDebitLine({
  service,
  paidUntil,
  standalone = false,
}: {
  service: AutoDebitDto["service"];
  // The business date (YYYY-MM-DD) up to which what the client already paid is valid.
  paidUntil: string | null;
  // True when there is no plan card around the line, so it draws its own card.
  standalone?: boolean;
}) {
  const { state, reload, cancel } = useMyAutoDebits();
  const { showSnackbar } = useSnackbar();
  const [cancelState, setCancelState] = useState<CancelState>({ phase: "idle" });
  useErrorSnackbar(cancelState.phase === "failed" ? cancelState.message : null);
  // A ref, not state: two clicks in the same tick both see the same render's state.
  const isCancellingRef = useRef(false);

  if (state === "loading") return null;
  if (state === "error") {
    return (
      <div className="mt-4">
        <p role="alert" className="text-sm text-danger">
          No pudimos cargar tu débito automático.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={reload} touchTarget className="mt-2">
          Reintentar
        </Button>
      </div>
    );
  }

  if (cancelState.phase === "cancelled") {
    return (
      <p className="mt-4 text-sm text-muted">{CANCELLED_TITLE}</p>
    );
  }

  const line = presentAutoDebitLine(state.debits, service);
  if (line === null) return null;

  async function confirmCancel(debitId: string): Promise<void> {
    if (isCancellingRef.current) return;
    isCancellingRef.current = true;
    setCancelState({ phase: "cancelling" });

    const result = await cancel(debitId);
    isCancellingRef.current = false;
    if (result.ok) {
      showSnackbar({ tone: "success", title: CANCELLED_TITLE, message: validityText(paidUntil) });
      setCancelState({ phase: "cancelled" });
      return;
    }
    setCancelState({ phase: "failed", message: result.message });
  }

  const isConfirming = cancelState.phase !== "idle";
  return (
    <Frame standalone={standalone}>
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full ring-4", DOT_CLASSES[line.tone])} />
          <div>
            <p className="text-sm font-semibold">{line.title}</p>
            {line.detail !== null ? <p className="mt-0.5 text-xs text-muted">{line.detail}</p> : null}
          </div>
        </div>
        {line.canCancel && !isConfirming ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setCancelState({ phase: "confirming" })}
            touchTarget
            className="w-full sm:w-auto"
          >
            Cancelar débito
          </Button>
        ) : null}
      </div>
      {isConfirming ? (
        <CancelConfirmation
          paidUntil={paidUntil}
          state={cancelState}
          onBack={() => setCancelState({ phase: "idle" })}
          onConfirm={() => void confirmCancel(line.debitId)}
        />
      ) : null}
    </Frame>
  );
}
