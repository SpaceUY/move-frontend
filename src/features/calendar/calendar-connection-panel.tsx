"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCardHeader } from "@/components/ui/section-card-header";
import { CalendarCheckIcon } from "@/components/ui/section-icons";
import { useSnackbar } from "@/components/ui/snackbar";
import { cn } from "@/lib/cn";
import type { CalendarOption, CalendarStatus, ProfessionalCalendarStatus } from "@/lib/api/types";

import { CalendarRules } from "./calendar-rules";
import {
  connectCalendar,
  disconnectCalendar,
  listCalendarOptions,
  releaseBlocks,
  selectCalendar,
  syncCalendarNow,
} from "./calendar-api";

export interface CalendarConnectionPanelProps {
  initialStatus: CalendarStatus;
}

// The card-head (title + status badge, bordered strip) that every state of
// this panel shares, so "Google Calendar" always labels this card instead of
// living in a heading the page renders separately above it.
function CalendarCard({ badge, children }: { badge?: ReactNode; children: ReactNode }) {
  return (
    <Card padding="none">
      <SectionCardHeader icon={<CalendarCheckIcon />} title="Google Calendar" aside={badge} />
      <div className="space-y-4 p-6">
        {children}
        <CalendarRules />
      </div>
    </Card>
  );
}

type StatusTone = "success" | "warning" | "neutral";

// A dot + plain text, not a bordered/uppercase pill: this card's status reads
// like `.badge`/`.status` in the approved design, not like the primitive
// `StatusBadge` pill used elsewhere in the staff area.
function CalendarStatus({ label, tone }: { label: string; tone: StatusTone }) {
  const toneClass = { success: "text-success", warning: "text-warning", neutral: "text-muted" }[
    tone
  ];
  return (
    <span className={cn("flex items-center gap-2 text-sm font-medium", toneClass)}>
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          tone === "neutral" ? "border border-current" : "bg-current",
        )}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

// A plain muted-bordered pill (not uppercase, not tone-colored) — matches
// `.tag` in the design, used for metadata like "which calendar is Google's
// own primary", distinct from MOVE's own selection state.
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-line-strong px-2 py-px text-xs font-medium text-muted">
      {children}
    </span>
  );
}

// v4: el texto deja explícito que los bloqueos NO se liberan al desconectar.
const DISCONNECT_CONFIRM_MESSAGE =
  "Los eventos que ya se crearon en Google no se borran. Los turnos que ya quedaron bloqueados no se liberan automáticamente: si hace falta liberarlos, hacelo a mano desde acá. MOVE deja de bloquear y sincronizar turnos nuevos.";

/** Which confirmation is open, if any. */
type PendingConfirm = "disconnect" | "release" | null;

// Every other date in the app goes through es-UY; this one used to render the
// raw ISO timestamp the API returns.
function formatSyncedAt(value: string | null | undefined): string {
  if (!value) return "Todavía no sincronizó";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Todavía no sincronizó";
  return date.toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function releaseBlocksConfirmMessage(professionalName: string): string {
  return `Esto va a mostrar como disponibles turnos que no pudimos confirmar con Google. Si ${professionalName} todavía está ocupado en alguno de esos horarios, se puede generar una doble reserva.`;
}

// MVP: hoy hay un solo profesional real (Pierina), así que se muestra
// `professionals[0]` directamente en vez de armar una vista de lista. Cuando
// haya un segundo profesional real, reemplazar esta tarjeta única por un
// `professionals.map(...)` que reuse el mismo cuerpo de tarjeta (spec v4 §8/§12).
export function CalendarConnectionPanel({ initialStatus }: CalendarConnectionPanelProps) {
  const router = useRouter();
  const [professional, setProfessional] = useState<ProfessionalCalendarStatus | undefined>(
    initialStatus.professionals[0],
  );
  const [options, setOptions] = useState<CalendarOption[] | null>(null);
  // The radio choice staged in the picker, confirmed by "Usar este calendario"
  // before `handleSelectCalendar` actually calls the API.
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const { showSnackbar } = useSnackbar();
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const showCalendarPicker = professional?.status === "connected" && professional.calendarId === null;

  useEffect(() => {
    if (!professional || !showCalendarPicker) return;
    listCalendarOptions(professional.professionalId)
      .then((loaded) => {
        setOptions(loaded);
        setSelectedCalendarId(null);
      })
      .catch(() => showSnackbar({ tone: "danger", title: "No se pudieron cargar los calendarios. Probá de nuevo." }));
  }, [professional, showCalendarPicker, showSnackbar]);

  if (!initialStatus.configured) {
    return (
      <Card>
        <p className="text-sm text-muted">
          Google Calendar no está configurado todavía (faltan credenciales en el servidor).
        </p>
      </Card>
    );
  }

  if (!professional) {
    return (
      <Card>
        <p className="text-sm text-muted">No hay ningún profesional para conectar un calendario todavía.</p>
      </Card>
    );
  }

  async function handleConnect() {
    if (!professional) return;
    setIsBusy(true);
    try {
      const { authUrl } = await connectCalendar(professional.professionalId);
      window.location.assign(authUrl);
    } catch {
      showSnackbar({ tone: "danger", title: "No se pudo conectar. Probá de nuevo." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSelectCalendar(calendarId: string) {
    if (!professional) return;
    setIsBusy(true);
    try {
      setProfessional(await selectCalendar(professional.professionalId, calendarId));
    } catch {
      showSnackbar({ tone: "danger", title: "No se pudo guardar el calendario elegido. Probá de nuevo." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSync() {
    if (!professional) return;
    setIsBusy(true);
    try {
      const status = await syncCalendarNow(professional.professionalId);
      setProfessional(status.professionals[0]);
    } catch {
      showSnackbar({ tone: "danger", title: "No se pudo sincronizar. Probá de nuevo." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!professional) return;
    setPendingConfirm(null);
    setIsBusy(true);
    try {
      await disconnectCalendar(professional.professionalId);
      setProfessional({
        ...professional,
        status: "disconnected",
        googleAccountEmail: null,
        calendarId: null,
        calendarName: null,
      });
    } catch {
      showSnackbar({ tone: "danger", title: "No se pudo desconectar. Probá de nuevo." });
    } finally {
      setIsBusy(false);
    }
  }

  // v4: único camino manual para liberar bloqueos (nunca se dispara automáticamente).
  // También disponible cuando está "disconnected", no solo "needs_reconnect".
  async function handleReleaseBlocks() {
    if (!professional) return;
    setPendingConfirm(null);
    setIsBusy(true);
    try {
      await releaseBlocks(professional.professionalId);
      showSnackbar({ tone: "success", title: "Bloqueos liberados." });
      // Refresca el resto de la página (p.ej. las badges de turnos bloqueados
      // en otras vistas de staff) para reflejar el cambio.
      router.refresh();
    } catch {
      showSnackbar({ tone: "danger", title: "No se pudieron liberar los bloqueos. Probá de nuevo." });
    } finally {
      setIsBusy(false);
    }
  }

  const confirmDialog =
    pendingConfirm === "disconnect" ? (
      <ConfirmDialog
        title="¿Desconectar Google Calendar?"
        description={DISCONNECT_CONFIRM_MESSAGE}
        confirmLabel="Desconectar Google Calendar"
        tone="destructive"
        isBusy={isBusy}
        onConfirm={handleDisconnect}
        onCancel={() => setPendingConfirm(null)}
      />
    ) : pendingConfirm === "release" ? (
      <ConfirmDialog
        title="¿Liberar los bloqueos igual?"
        description={releaseBlocksConfirmMessage(professional.professionalName)}
        confirmLabel="Liberar igual"
        tone="destructive"
        isBusy={isBusy}
        onConfirm={handleReleaseBlocks}
        onCancel={() => setPendingConfirm(null)}
      />
    ) : null;


  if (professional.status === "disconnected") {
    return (
      <CalendarCard>
        <p className="text-sm text-muted">
          Conectá el Google Calendar de {professional.professionalName} para bloquear turnos ocupados y ver
          las reservas de MOVE ahí.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleConnect} disabled={isBusy}>
            Conectar Google Calendar
          </Button>
          <Button variant="secondary" onClick={() => setPendingConfirm("release")} disabled={isBusy}>
            Liberar bloqueos
          </Button>
        </div>
        {confirmDialog}
      </CalendarCard>
    );
  }

  if (professional.status === "needs_reconnect") {
    return (
      <CalendarCard badge={<CalendarStatus label="Hay que reconectar" tone="warning" />}>
        <p className="text-sm text-muted">
          Perdimos el acceso a Google Calendar. Los turnos ya bloqueados siguen bloqueados hasta reconectar o
          liberarlos a mano — no se liberan solos.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleConnect} disabled={isBusy}>
            Reconectar
          </Button>
          <Button variant="secondary" onClick={() => setPendingConfirm("release")} disabled={isBusy}>
            Liberar bloqueos
          </Button>
        </div>
        {confirmDialog}
      </CalendarCard>
    );
  }

  if (showCalendarPicker) {
    return (
      <CalendarCard badge={<CalendarStatus label="Falta elegir calendario" tone="neutral" />}>
        <fieldset>
          <legend className="text-sm text-muted">
            Elegí qué calendario sincroniza con los turnos de {professional.professionalName}:
          </legend>
          <div className="mt-3 space-y-2">
            {(options ?? []).map((option) => {
              const optionId = `calendar-option-${option.id}`;
              const checked = selectedCalendarId === option.id;
              return (
                <label
                  key={option.id}
                  htmlFor={optionId}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded border px-4 py-3 text-sm transition-colors",
                    checked ? "border-white bg-soft" : "border-line-strong hover:bg-soft",
                    isBusy ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                  )}
                >
                  <input
                    id={optionId}
                    type="radio"
                    name="calendar-option"
                    checked={checked}
                    disabled={isBusy}
                    onChange={() => setSelectedCalendarId(option.id)}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      "relative size-[18px] shrink-0 rounded-full border",
                      checked ? "border-white" : "border-line-strong",
                    )}
                    aria-hidden="true"
                  >
                    {checked ? (
                      <span className="absolute inset-0 m-auto size-2 rounded-full bg-white" />
                    ) : null}
                  </span>
                  {option.summary}
                  {option.primary ? <Tag>Principal</Tag> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={isBusy || !selectedCalendarId}
            onClick={() => setSelectedCalendarId(null)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isBusy || !selectedCalendarId}
            onClick={() => selectedCalendarId && handleSelectCalendar(selectedCalendarId)}
          >
            Usar este calendario
          </Button>
        </div>
        {confirmDialog}
      </CalendarCard>
    );
  }

  return (
    <CalendarCard badge={<CalendarStatus label="Conectado" tone="success" />}>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted">Cuenta</dt>
        <dd className="min-w-0 break-words">{professional.googleAccountEmail}</dd>
        <dt className="text-muted">Calendario</dt>
        <dd className="min-w-0 break-words">{professional.calendarName}</dd>
        <dt className="text-muted">Última sincronización</dt>
        <dd className="min-w-0 break-words">{formatSyncedAt(professional.lastPushAt ?? professional.lastPullAt)}</dd>
      </dl>
      <div className="flex gap-3">
        <Button variant="secondary" size="sm" onClick={handleSync} disabled={isBusy}>
          Sincronizar ahora
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setPendingConfirm("disconnect")} disabled={isBusy}>
          Desconectar
        </Button>
      </div>
      {confirmDialog}
    </CalendarCard>
  );
}
