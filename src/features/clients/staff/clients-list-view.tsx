import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { ROUTES } from "@/config/constants/routes.constants";
import { CLIENT_ACCOUNT_STATUSES } from "@/lib/api/types";
import type { AttendanceStatus, ClientAccountStatus, ClientPage, ClientRow } from "@/lib/api/types";
import { cn } from "@/lib/cn";

import { formatClientDate } from "./client-dates";
import { clientsListHref, CLIENTS_PAGE_SIZE, type ClientsListParams } from "./clients-list-params";

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Presente",
  absent: "Ausente",
};

const ATTENDANCE_TONE: Record<AttendanceStatus, "success" | "neutral"> = {
  present: "success",
  absent: "neutral",
};

const ACTIVE_COLUMNS = ["Próxima reserva", "Última asistencia"];
const DEACTIVATED_COLUMNS = ["Dado de baja"];

const isDeactivated = (status: ClientAccountStatus) => status === CLIENT_ACCOUNT_STATUSES.DEACTIVATED;

function countText(total: number, params: ClientsListParams): string {
  const { status, expiringSoon, everyone } = params;
  if (expiringSoon) return total === 1 ? "1 cliente vence pronto." : `${total} clientes vencen pronto.`;
  if (everyone) return total === 1 ? "1 cliente registrado." : `${total} clientes registrados.`;
  if (!isDeactivated(status)) return total === 1 ? "1 cliente activo." : `${total} clientes activos.`;
  return total === 1 ? "1 cliente dado de baja." : `${total} clientes dados de baja.`;
}

function formatNextBooking(value: string | null): string {
  if (!value) return "Sin reservas";
  return new Date(value).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** First letter of the first and last name, for the row avatar. */
function initialsOf(name: string, lastName: string | null): string {
  const letters = `${name.charAt(0)}${(lastName ?? "").charAt(0)}`.toUpperCase();
  return letters || "?";
}

function ClientsTableHeader({ status }: { status: ClientAccountStatus }) {
  return (
    <TableHeader>
      <TableHeaderCell>Cliente</TableHeaderCell>
      <TableHeaderCell>Teléfono</TableHeaderCell>
      {(isDeactivated(status) ? DEACTIVATED_COLUMNS : ACTIVE_COLUMNS).map((column) => (
        <TableHeaderCell key={column}>{column}</TableHeaderCell>
      ))}
      <TableHeaderCell align="right">
        <span className="sr-only">Acciones</span>
      </TableHeaderCell>
    </TableHeader>
  );
}

function StatusCells({ client, status }: { client: ClientRow; status: ClientAccountStatus }) {
  if (isDeactivated(status)) {
    return (
      <TableCell className="whitespace-nowrap">
        {client.deactivatedAt ? formatClientDate(client.deactivatedAt) : "—"}
      </TableCell>
    );
  }
  return (
    <>
      <TableCell className="whitespace-nowrap">{formatNextBooking(client.nextBookingAt)}</TableCell>
      <TableCell>
        {client.lastAttendanceStatus ? (
          <StatusBadge
            label={ATTENDANCE_LABEL[client.lastAttendanceStatus]}
            tone={ATTENDANCE_TONE[client.lastAttendanceStatus]}
          />
        ) : (
          <span className="text-muted">—</span>
        )}
      </TableCell>
    </>
  );
}

function ClientTableRow({ client, status }: { client: ClientRow; status: ClientAccountStatus }) {
  const fullName = `${client.name} ${client.lastName ?? ""}`.trim();
  const recordHref = `${ROUTES.STAFF_CLIENTS}/${client.id}`;
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-soft text-xs font-semibold"
          >
            {initialsOf(client.name, client.lastName)}
          </span>
          <div className="min-w-0">
            <Link href={recordHref} className="block font-medium text-white underline-offset-2 hover:underline">
              {fullName}
            </Link>
            <span className="block truncate text-xs text-muted">{client.email}</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted">{client.phone ?? "—"}</TableCell>
      <StatusCells client={client} status={status} />
      <TableCell align="right">
        <Link href={recordHref} className={cn(buttonVariants({ variant: "ghost", size: "sm", touchTarget: true }))}>
          Ver ficha<span className="sr-only">{` de ${fullName}`}</span>
        </Link>
      </TableCell>
    </TableRow>
  );
}

// The "Activos" tab only holds clients with a plan or recent activity, so a search there says it looked only among them.
function searchMissText(params: ClientsListParams): string {
  const amongActive = !isDeactivated(params.status) && !params.expiringSoon && !params.everyone;
  return `No encontramos resultados para «${params.q}»${amongActive ? " entre los clientes activos" : ""}.`;
}

function ClientsEmptyState({ params, total }: { params: ClientsListParams; total: number }) {
  // A page number typed in the URL beyond the last one.
  if (total > 0) {
    return (
      <EmptyState
        title="Esta página no tiene clientes"
        action={
          <Link
            href={clientsListHref({ ...params, page: 1 })}
            className={buttonVariants({ variant: "secondary", touchTarget: true })}
          >
            Ir a la primera página
          </Link>
        }
      />
    );
  }
  if (params.q) {
    return (
      <EmptyState
        title="Ningún cliente coincide con la búsqueda"
        description={searchMissText(params)}
        action={
          <Link
            href={clientsListHref({ ...params, q: "", page: 1 })}
            className={buttonVariants({ variant: "secondary", touchTarget: true })}
          >
            Ver todos
          </Link>
        }
      />
    );
  }
  if (params.expiringSoon) {
    return (
      <EmptyState
        title="Nadie vence pronto"
        description="Cuando un plan esté por vencer, el cliente va a aparecer acá."
        action={
          <Link
            href={clientsListHref({ ...params, expiringSoon: false, page: 1 })}
            className={buttonVariants({ variant: "secondary", touchTarget: true })}
          >
            Ver todos los clientes
          </Link>
        }
      />
    );
  }
  if (isDeactivated(params.status)) {
    return (
      <EmptyState
        title="No hay clientes dados de baja"
        description="Cuando des de baja a un cliente desde su ficha va a aparecer acá."
      />
    );
  }
  if (params.everyone) {
    return (
      <EmptyState title="Todavía no hay clientes" description="Cuando alguien se registre en la web va a aparecer acá." />
    );
  }
  return (
    <EmptyState title="No hay clientes activos" description="Cuando un cliente tenga un plan vigente va a aparecer acá." />
  );
}

function PageLink({ params, page, label, ariaLabel }: { params: ClientsListParams; page: number; label: string; ariaLabel: string }) {
  return (
    <Link
      href={clientsListHref({ ...params, page })}
      aria-label={ariaLabel}
      className={buttonVariants({ variant: "secondary", size: "sm", touchTarget: true })}
    >
      {label}
    </Link>
  );
}

function DisabledPageButton({ label, ariaLabel }: { label: string; ariaLabel: string }) {
  return (
    <Button type="button" variant="secondary" size="sm" touchTarget disabled aria-label={ariaLabel}>
      {label}
    </Button>
  );
}

function ClientsPagination({ params, total }: { params: ClientsListParams; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE));
  const rangeStart = (params.page - 1) * CLIENTS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(params.page * CLIENTS_PAGE_SIZE, total);
  return (
    <nav
      aria-label="Paginación de clientes"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4"
    >
      <p className="text-xs text-muted">
        Mostrando {rangeStart}–{rangeEnd} de {total}
      </p>
      <div className="flex gap-2">
        {params.page <= 1 ? (
          <DisabledPageButton label="← Anterior" ariaLabel="Ir a la página anterior" />
        ) : (
          <PageLink params={params} page={params.page - 1} label="← Anterior" ariaLabel="Ir a la página anterior" />
        )}
        {params.page >= totalPages ? (
          <DisabledPageButton label="Siguiente →" ariaLabel="Ir a la página siguiente" />
        ) : (
          <PageLink params={params} page={params.page + 1} label="Siguiente →" ariaLabel="Ir a la página siguiente" />
        )}
      </div>
    </nav>
  );
}

/** The list the URL asks for, already loaded: no state, every control is a link. */
export function ClientsListView({ data, params }: { data: ClientPage; params: ClientsListParams }) {
  const hasClients = data.items.length > 0;
  const showCountAbove = data.total > 0 && !isDeactivated(params.status);
  const showCountBelow = hasClients && isDeactivated(params.status);
  const count = countText(data.total, params);

  return (
    <>
      {showCountAbove ? <p className="text-sm text-muted">{count}</p> : null}
      <Card padding="none">
        {hasClients ? (
          <>
            <Table caption="Clientes">
              <ClientsTableHeader status={params.status} />
              <TableBody>
                {data.items.map((client) => (
                  <ClientTableRow key={client.id} client={client} status={params.status} />
                ))}
              </TableBody>
            </Table>
            {showCountBelow ? (
              <p className="px-5 pt-3 pb-1 text-xs text-muted">{count}</p>
            ) : null}
            <ClientsPagination params={params} total={data.total} />
          </>
        ) : (
          <ClientsEmptyState params={params} total={data.total} />
        )}
      </Card>
    </>
  );
}

/** Shown while the next list is on its way; the filters above stay where they are. */
export function ClientsListSkeleton({ status }: { status: ClientAccountStatus }) {
  const extraColumns = isDeactivated(status) ? DEACTIVATED_COLUMNS.length : ACTIVE_COLUMNS.length;
  return (
    <Card padding="none" aria-busy="true">
      <p role="status" className="sr-only">
        Cargando clientes…
      </p>
      <Table caption="Clientes">
        <ClientsTableHeader status={status} />
        <TableBody>
          {[0, 1, 2, 3].map((row) => (
            <TableRow key={row}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-full bg-line" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-28 bg-line" />
                    <Skeleton className="h-3 w-36 bg-line" />
                  </div>
                </div>
              </TableCell>
              {Array.from({ length: extraColumns + 1 }, (_, cell) => (
                <TableCell key={cell}>
                  <Skeleton className="h-4 w-20 bg-line" />
                </TableCell>
              ))}
              <TableCell align="right" />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
