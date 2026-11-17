import { Suspense } from "react";

import { StaffPage, StaffPageHeader, StaffPageLoading } from "@/components/layout/staff-page";
import { Notice } from "@/components/ui/notice";
import { USER_ROLES } from "@/config/constants/user-roles.constants";
import { CalendarConnectionPanel, getCalendarStatus } from "@/features/calendar";
import { getSettings, SettingsForm } from "@/features/settings";
import { requireRole } from "@/lib/session";

const PAGE_DESCRIPTION =
  "Reglas de reservas, alertas de seguimiento e integración con Google Calendar.";

type SearchParams = Promise<{ calendar?: string }>;

// Set by the backend's OAuth callback redirect (?calendar=connected|error) so
// staff gets feedback even when the consent screen fails or is denied.
const CALENDAR_CALLBACK_MESSAGE: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "Google Calendar conectado." },
  error: { tone: "error", text: "No se pudo conectar Google Calendar." },
};

export default function StaffSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <StaffPage>
      <Suspense fallback={<StaffPageLoading title="Configuración" />}>
        <StaffSettingsContent searchParams={searchParams} />
      </Suspense>
    </StaffPage>
  );
}

export async function StaffSettingsContent({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(USER_ROLES.STAFF);
  const settings = await getSettings();
  const calendarStatus = await getCalendarStatus();
  const { calendar } = await searchParams;
  const callback = calendar ? CALENDAR_CALLBACK_MESSAGE[calendar] : undefined;

  return (
    <>
      <StaffPageHeader title="Configuración" description={PAGE_DESCRIPTION} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <SettingsForm initialValues={settings} />
        {/* Stays in view while the sections scroll; the cap keeps its tail reachable on a short screen. */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {callback ? (
            <Notice
              tone={callback.tone === "error" ? "danger" : "success"}
              role={callback.tone === "error" ? "alert" : "status"}
            >
              {callback.text}
            </Notice>
          ) : null}
          <CalendarConnectionPanel initialStatus={calendarStatus} />
        </div>
      </div>
    </>
  );
}
