import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithSnackbar } from "@/test/render-with-snackbar";

import type { CalendarStatus, ProfessionalCalendarStatus } from "@/lib/api/types";

import {
  connectCalendar,
  disconnectCalendar,
  listCalendarOptions,
  releaseBlocks,
  selectCalendar,
  syncCalendarNow,
} from "./calendar-api";
import { CalendarConnectionPanel } from "./calendar-connection-panel";

vi.mock("./calendar-api", () => ({
  connectCalendar: vi.fn(),
  disconnectCalendar: vi.fn(),
  listCalendarOptions: vi.fn(),
  releaseBlocks: vi.fn(),
  selectCalendar: vi.fn(),
  syncCalendarNow: vi.fn(),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const connectCalendarMock = vi.mocked(connectCalendar);
const disconnectCalendarMock = vi.mocked(disconnectCalendar);
const releaseBlocksMock = vi.mocked(releaseBlocks);
const syncCalendarNowMock = vi.mocked(syncCalendarNow);
const listCalendarOptionsMock = vi.mocked(listCalendarOptions);
const selectCalendarMock = vi.mocked(selectCalendar);

function pro(overrides: Partial<ProfessionalCalendarStatus> = {}): ProfessionalCalendarStatus {
  return {
    professionalId: "prof-1",
    professionalName: "Pierina",
    status: "disconnected",
    googleAccountEmail: null,
    calendarId: null,
    calendarName: null,
    lastPushAt: null,
    lastPullAt: null,
    ...overrides,
  };
}

function statusWith(professional: ProfessionalCalendarStatus, configured = true): CalendarStatus {
  return { configured, professionals: [professional] };
}

beforeEach(() => {
  vi.clearAllMocks();
  listCalendarOptionsMock.mockResolvedValue([]);
  vi.stubGlobal("location", { ...window.location, assign: vi.fn() });
});

describe("CalendarConnectionPanel", () => {
  it.each([
    ["disconnected", pro()],
    ["needs_reconnect", pro({ status: "needs_reconnect" })],
    ["connected", pro({ status: "connected", googleAccountEmail: "a@b.c", calendarId: "cal", calendarName: "Cal" })],
  ])("titles the card Google Calendar when %s", (_state, professional) => {
    renderWithSnackbar(<CalendarConnectionPanel initialStatus={statusWith(professional)} />);

    expect(screen.getByRole("heading", { name: "Google Calendar" })).toBeDefined();
  });

  it("shows a connect button when disconnected", () => {
    renderWithSnackbar(<CalendarConnectionPanel initialStatus={statusWith(pro())} />);
    expect(screen.getByRole("button", { name: "Conectar Google Calendar" })).toBeDefined();
  });

  it("also shows 'Liberar bloqueos' when disconnected (v4)", async () => {
    const user = userEvent.setup();
    renderWithSnackbar(<CalendarConnectionPanel initialStatus={statusWith(pro({ status: "disconnected" }))} />);

    expect(screen.getByRole("button", { name: "Liberar bloqueos" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Liberar bloqueos" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Liberar igual" }),
    );

    expect(releaseBlocksMock).toHaveBeenCalledWith("prof-1");
  });

  it("shows a static message and no button when not configured", () => {
    renderWithSnackbar(<CalendarConnectionPanel initialStatus={statusWith(pro(), false)} />);
    expect(screen.queryByRole("button", { name: "Conectar Google Calendar" })).toBeNull();
  });

  it("navigates to the authUrl on connect, scoped to the professional's id", async () => {
    connectCalendarMock.mockResolvedValue({ authUrl: "https://accounts.google.com/auth" });
    const user = userEvent.setup();
    renderWithSnackbar(<CalendarConnectionPanel initialStatus={statusWith(pro())} />);

    await user.click(screen.getByRole("button", { name: "Conectar Google Calendar" }));

    expect(connectCalendarMock).toHaveBeenCalledWith("prof-1");
    expect(window.location.assign).toHaveBeenCalledWith("https://accounts.google.com/auth");
  });

  it("shows a reconnect warning AND a 'Liberar bloqueos' button when needs_reconnect (v4)", () => {
    renderWithSnackbar(
      <CalendarConnectionPanel
        initialStatus={statusWith(
          pro({
            status: "needs_reconnect",
            googleAccountEmail: "pierina@move.uy",
            calendarId: "cal-1",
            calendarName: "MOVE",
          }),
        )}
      />,
    );
    expect(screen.getByText("Reconectar")).toBeDefined();
    expect(screen.getByRole("button", { name: "Liberar bloqueos" })).toBeDefined();
  });

  it("does NOT show 'Liberar bloqueos' when healthily connected (v4)", () => {
    renderWithSnackbar(
      <CalendarConnectionPanel
        initialStatus={statusWith(
          pro({
            status: "connected",
            googleAccountEmail: "pierina@move.uy",
            calendarId: "cal-1",
            calendarName: "MOVE",
          }),
        )}
      />,
    );
    expect(screen.queryByRole("button", { name: "Liberar bloqueos" })).toBeNull();
  });

  it("calls releaseBlocks after confirming the risk warning (v4)", async () => {
    const user = userEvent.setup();
    renderWithSnackbar(
      <CalendarConnectionPanel initialStatus={statusWith(pro({ status: "needs_reconnect" }))} />,
    );

    await user.click(screen.getByRole("button", { name: "Liberar bloqueos" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/doble reserva/);
    expect(releaseBlocksMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Liberar igual" }));

    expect(releaseBlocksMock).toHaveBeenCalledWith("prof-1");
  });

  it("does not release the blocks when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderWithSnackbar(
      <CalendarConnectionPanel initialStatus={statusWith(pro({ status: "needs_reconnect" }))} />,
    );

    await user.click(screen.getByRole("button", { name: "Liberar bloqueos" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(releaseBlocksMock).not.toHaveBeenCalled();
  });

  it("shows account, calendar and a disconnect button when fully connected", () => {
    renderWithSnackbar(
      <CalendarConnectionPanel
        initialStatus={statusWith(
          pro({
            status: "connected",
            googleAccountEmail: "pierina@move.uy",
            calendarId: "cal-1",
            calendarName: "MOVE",
          }),
        )}
      />,
    );
    expect(screen.getByText("pierina@move.uy")).toBeDefined();
    expect(screen.getByRole("button", { name: "Desconectar" })).toBeDefined();
  });

  it("disconnect confirmation text says blocks are NOT released (v4)", async () => {
    const user = userEvent.setup();
    renderWithSnackbar(
      <CalendarConnectionPanel
        initialStatus={statusWith(
          pro({
            status: "connected",
            googleAccountEmail: "pierina@move.uy",
            calendarId: "cal-1",
            calendarName: "MOVE",
          }),
        )}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Desconectar" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("no se liberan");
    expect(dialog.textContent).toContain("no se borran");
    expect(disconnectCalendarMock).not.toHaveBeenCalled();
  });

  it("syncs now, scoped to the professional's id", async () => {
    syncCalendarNowMock.mockResolvedValue(
      statusWith(pro({ status: "connected", lastPushAt: "2026-10-19T12:00:00.000Z" })),
    );
    const user = userEvent.setup();
    renderWithSnackbar(
      <CalendarConnectionPanel
        initialStatus={statusWith(
          pro({
            status: "connected",
            googleAccountEmail: "pierina@move.uy",
            calendarId: "cal-1",
            calendarName: "MOVE",
          }),
        )}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sincronizar ahora" }));

    expect(syncCalendarNowMock).toHaveBeenCalledWith("prof-1");
  });

  it("shows an error alert when connectCalendar fails", async () => {
    connectCalendarMock.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderWithSnackbar(<CalendarConnectionPanel initialStatus={statusWith(pro())} />);

    await user.click(screen.getByRole("button", { name: "Conectar Google Calendar" }));

    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo conectar. Probá de nuevo.");
  });

  it("shows a success message and refreshes after releaseBlocks succeeds (v4)", async () => {
    releaseBlocksMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithSnackbar(
      <CalendarConnectionPanel initialStatus={statusWith(pro({ status: "needs_reconnect" }))} />,
    );

    await user.click(screen.getByRole("button", { name: "Liberar bloqueos" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Liberar igual" }),
    );

    expect((await screen.findByRole("status")).textContent).toContain("Bloqueos liberados.");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows an error alert when releaseBlocks fails", async () => {
    releaseBlocksMock.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderWithSnackbar(
      <CalendarConnectionPanel initialStatus={statusWith(pro({ status: "needs_reconnect" }))} />,
    );

    await user.click(screen.getByRole("button", { name: "Liberar bloqueos" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Liberar igual" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain("No se pudieron liberar los bloqueos. Probá de nuevo.");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows the calendar options as a radio group and only saves after confirming", async () => {
    listCalendarOptionsMock.mockResolvedValue([
      { id: "cal-1", summary: "Turnos Pierina", primary: true, accessRole: "owner" },
      { id: "cal-2", summary: "Personal", primary: false, accessRole: "owner" },
    ]);
    selectCalendarMock.mockResolvedValue(
      pro({ status: "connected", calendarId: "cal-2", calendarName: "Personal" }),
    );
    const user = userEvent.setup();
    renderWithSnackbar(
      <CalendarConnectionPanel
        initialStatus={statusWith(pro({ status: "connected", calendarId: null }))}
      />,
    );

    const option = (await screen.findByRole("radio", { name: "Personal" })) as HTMLInputElement;
    expect(option.checked).toBe(false);
    expect(screen.getByRole("button", { name: "Usar este calendario" })).toHaveProperty(
      "disabled",
      true,
    );

    await user.click(option);
    expect(selectCalendarMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Usar este calendario" }));

    expect(selectCalendarMock).toHaveBeenCalledWith("prof-1", "cal-2");
    expect(await screen.findByText("Personal")).toBeDefined();
  });

  describe("rules list", () => {
    const RULES = [
      'Un evento marcado como "Ocupado" bloquea los turnos que se pisan con él. Si lo borrás o lo pasás a "Libre", el turno se libera solo.',
      "Un evento de todo el día bloquea todos los turnos de ese día, desde las 00:00 hasta las 23:59. Si algo dura unas horas, cargalo con hora de inicio y fin.",
      'Los recordatorios de todo el día (cumpleaños, trámites) dejalos en "Libre".',
      "Los eventos que rechazaste no bloquean.",
      "Las reservas que MOVE agrega a tu calendario no bloquean nada.",
      "Si ya había una reserva en ese horario, no se cancela: le llega un mail al dueño del calendario para revisarla.",
      "Si Google falla, los turnos bloqueados siguen bloqueados.",
    ];

    it.each([
      ["disconnected", pro({ status: "disconnected" })],
      [
        "needs_reconnect",
        pro({ status: "needs_reconnect", googleAccountEmail: "pierina@move.uy" }),
      ],
      [
        "connected without a calendar picked",
        pro({ status: "connected", googleAccountEmail: "pierina@move.uy", calendarId: null }),
      ],
      [
        "connected",
        pro({
          status: "connected",
          googleAccountEmail: "pierina@move.uy",
          calendarId: "cal-1",
          calendarName: "MOVE",
        }),
      ],
    ])("shows how Google Calendar blocking works when %s", (_state, professional) => {
      renderWithSnackbar(<CalendarConnectionPanel initialStatus={statusWith(professional)} />);

      const items = within(screen.getByRole("list", { name: "Cómo funciona" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent);

      expect(items).toEqual(RULES);
    });

    it("does not show the rules when Google Calendar is not configured", () => {
      renderWithSnackbar(<CalendarConnectionPanel initialStatus={statusWith(pro(), false)} />);

      expect(screen.queryByRole("list", { name: "Cómo funciona" })).toBeNull();
    });
  });
});
