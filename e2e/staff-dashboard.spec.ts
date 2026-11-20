import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { setOwner, setScenario } from "./support/use-scenario";

type DashboardScenario = "staff-dashboard" | "staff-dashboard-empty" | "staff-dashboard-money-down";

async function actAsStaff(page: Page, baseURL: string, scenario: DashboardScenario) {
  await setScenario(page.context(), baseURL, scenario);
  await setOwner(page.context(), baseURL, randomUUID());
}

const tile = (page: Page, label: string): Locator =>
  page.locator("article").filter({ has: page.getByRole("heading", { name: label }) });

// The query of the current URL, as an object: the order of the parameters is not what matters.
function query(page: Page): Record<string, string> {
  return Object.fromEntries(new URL(page.url()).searchParams);
}

const TILES = [
  { label: "Asistencia sin marcar", href: "/staff/schedule", value: "6", line: "en 2 turnos ya empezados" },
  { label: "Pagos para revisar", href: "/staff/payments?needsAttention=true", value: "2", line: "de Mercado Pago con algún problema" },
  { label: "Vencen pronto", href: "/staff/clients?vence=pronto", value: "4", line: "1 vence mañana · 4 clientes" },
  { label: "Cobros atrasados", href: "/staff/payments?view=to-collect&atrasados=true", value: "3", line: "de días anteriores" },
  { label: "Clientes en riesgo", href: "/staff/follow-up?riesgo=true", value: "23", line: "7 urgentes" },
] as const;

test.describe("Staff dashboard: Hoy", () => {
  test("Hoy shows birthday, tiles and Cobrar hoy, and each tile goes to its page", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!, "staff-dashboard");
    await page.goto("/staff");

    await expect(page.getByRole("link", { name: /^Hoy/ })).toHaveAttribute("aria-current", "page");
    const birthday = page.getByRole("region", { name: "Cumpleaños hoy" });
    await expect(birthday).toContainText("Martina Pérez");
    await expect(birthday.getByRole("link", { name: "Saludar por WhatsApp" })).toBeVisible();

    for (const { label, href, value, line } of TILES) {
      const card = tile(page, label);
      await expect(card).toContainText(value);
      await expect(card).toContainText(line);
      await expect(card.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }

    const collect = page.getByRole("region", { name: "Cobrar hoy" });
    await expect(collect).toContainText("4 clientes · 1 todavía sin monto");
    await expect(collect.getByRole("link", { name: "Lucía Castro" })).toBeVisible();
    await expect(collect).toContainText("Cliente sin datos");
    await expect(collect).toContainText("ya vino");
    await expect(collect.getByRole("link", { name: "Cobrar hoy" })).toHaveAttribute("href", "/staff/payments?view=to-collect&dia=hoy");

    await tile(page, "Clientes en riesgo").getByRole("link", { name: "Clientes en riesgo" }).click();
    await expect(page).toHaveURL(/\/staff\/follow-up\?riesgo=true$/);
  });

  test("an empty day dims every tile and hides the birthday card", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!, "staff-dashboard-empty");
    await page.goto("/staff");

    for (const line of [
      "Todo marcado ✓",
      "Nada para revisar ✓",
      "Nadie vence en los próximos 10 días ✓",
      "Nadie debe de días anteriores ✓",
      "Nadie en riesgo ✓",
    ]) {
      await expect(page.getByText(line)).toBeVisible();
    }
    for (const { label } of TILES) {
      await expect(tile(page, label).locator("p").first()).toHaveClass(/text-muted/);
    }
    await expect(page.getByRole("region", { name: "Cumpleaños hoy" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Cobrar hoy" })).toContainText("No hay nada para cobrar hoy ✓");
    await expect(page.getByText("pendientes")).toHaveCount(0);
  });
});

test.describe("Staff dashboard: Negocio", () => {
  test("Negocio keeps period, comparison and service in the URL across reload and back", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!, "staff-dashboard");
    await page.goto("/staff");

    await page.getByRole("link", { name: /^Negocio/ }).click();
    await expect(page).toHaveURL(/\/staff\?vista=negocio$/);
    await expect(page.getByRole("heading", { name: "¿Cuánto entra y de dónde?" })).toBeVisible();

    await page.getByRole("combobox", { name: "Período" }).selectOption("este-anio");
    await expect(page).toHaveURL(/periodo=este-anio/);
    await page.getByRole("combobox", { name: "Comparar con" }).selectOption("anio-pasado");
    await expect(page).toHaveURL(/comparar=anio-pasado/);
    // The data of the fake start eight months ago: a year ago has nothing to compare with.
    await expect(page.getByText("sin datos para comparar").first()).toBeVisible();

    await page.getByRole("group", { name: "Servicio" }).getByRole("link", { name: "Rehab" }).click();
    await expect(page.getByRole("heading", { name: "¿Cuánto entra y de dónde? · Rehab" })).toBeVisible();
    await page.getByRole("navigation", { name: "Secciones de Negocio" }).getByRole("link", { name: "Turnos" }).click();
    await expect(page.getByRole("heading", { name: "¿Usamos bien los turnos que abrimos? · Rehab" })).toBeVisible();
    expect(query(page)).toEqual({ vista: "negocio", tab: "turnos", periodo: "este-anio", comparar: "anio-pasado", servicio: "rehab" });

    await page.reload();
    expect(query(page)).toEqual({ vista: "negocio", tab: "turnos", periodo: "este-anio", comparar: "anio-pasado", servicio: "rehab" });
    await expect(page.getByRole("combobox", { name: "Período" })).toHaveValue("este-anio");
    await expect(page.getByRole("combobox", { name: "Comparar con" })).toHaveValue("anio-pasado");
    await expect(page.getByRole("group", { name: "Servicio" }).getByRole("link", { name: "Rehab" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "¿Usamos bien los turnos que abrimos? · Rehab" })).toBeVisible();

    // Back: the tab was a link, so one step undoes it and keeps the rest.
    await page.goBack();
    await expect(page.getByRole("heading", { name: "¿Cuánto entra y de dónde? · Rehab" })).toBeVisible();
    expect(query(page)).toEqual({ vista: "negocio", periodo: "este-anio", comparar: "anio-pasado", servicio: "rehab" });
    // And back again: the service was a link too, so this is Plata for everybody.
    await page.goBack();
    await expect(page.getByRole("heading", { name: "¿Cuánto entra y de dónde?" })).toBeVisible();
    expect(query(page)).toEqual({ vista: "negocio", periodo: "este-anio", comparar: "anio-pasado" });
  });

  test("Turnos and Clientes show their numbers and cards", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!, "staff-dashboard");
    await page.goto("/staff?vista=negocio&tab=turnos");

    await expect(tile(page, "Ocupación")).toContainText("74%");
    await expect(tile(page, "Ocupación")).toContainText("280 de 380 cupos");
    await expect(tile(page, "Asistencia")).toContainText("90%");
    await expect(tile(page, "Cancelaciones")).toContainText("8 el mismo día");
    await expect(page.getByRole("heading", { name: "Quién cancela" })).toBeVisible();
    await expect(page.getByText("Staff (sin detalle)")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Qué pasó con los cupos" })).toBeVisible();
    await expect(page.getByText("150 de 200 cupos")).toBeVisible();
    await page.getByRole("radio", { name: "Día y hora" }).click();
    await expect(page.getByRole("table", { name: "Ocupación por día y hora" })).toBeVisible();

    await page.getByRole("navigation", { name: "Secciones de Negocio" }).getByRole("link", { name: "Clientes" }).click();

    await expect(tile(page, "Clientes activos hoy")).toContainText("84");
    await expect(tile(page, "Clientes activos hoy")).toContainText("+9 altas / −4 bajas");
    await expect(tile(page, "Renovación")).toContainText("17 de 25 · 4 en curso");
    await expect(page.getByRole("heading", { name: "Activos, altas y bajas por semana" })).toBeVisible();
    const byService = page.locator("section").filter({ has: page.getByRole("heading", { name: "Renovación por servicio" }) });
    await expect(byService).toContainText("Performance");
    await expect(byService).toContainText("79%");
    await expect(byService).toContainText("11 de 14");
    await expect(byService).toContainText("Recovery");
    await expect(byService).toContainText("55%");
    await expect(byService).not.toContainText("Rehab");
    await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Por qué pausan" }) })).toContainText("Lesión");
  });

  test("Clientes: range buttons replace the period menus", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!, "staff-dashboard");
    await page.goto("/staff?vista=negocio&tab=clientes");

    await expect(page.getByRole("combobox", { name: "Período" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Comparar con" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Agrupar por" })).toHaveCount(0);
    const range = page.getByRole("group", { name: "Rango" });
    await expect(range.getByRole("link", { name: "6 meses" })).toHaveAttribute("aria-current", "page");

    await range.getByRole("link", { name: "3 meses" }).click();
    await expect(page).toHaveURL(/rango=3-meses/);
    await expect(page.getByRole("heading", { name: "Activos, altas y bajas por día" })).toBeVisible();

    await page.getByRole("group", { name: "Servicio" }).getByRole("link", { name: "Rehab" }).click();
    await expect(page.getByRole("heading", { name: "¿Crecemos o perdemos gente, y por qué? · Rehab" })).toBeVisible();
    expect(query(page)).toEqual({ vista: "negocio", tab: "clientes", rango: "3-meses", servicio: "rehab" });

    await page.getByRole("navigation", { name: "Secciones de Negocio" }).getByRole("link", { name: "Plata" }).click();
    await expect(page.getByRole("combobox", { name: "Período" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Rango" })).toHaveCount(0);
  });

  test("Clientes with Rehab has no bajas to count: a dash with no sign, and no renewal", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!, "staff-dashboard");
    await page.goto("/staff?vista=negocio&tab=clientes&servicio=rehab");

    await expect(tile(page, "Clientes activos hoy")).toContainText("— bajas");
    await expect(tile(page, "Clientes activos hoy")).not.toContainText("−—");
    await expect(page.getByText("Rehab no tiene planes, así que no tiene renovación.")).toBeVisible();
  });

  test("money stats failure only breaks Plata", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!, "staff-dashboard-money-down");
    await page.goto("/staff?vista=negocio");

    // Next also keeps an empty role="alert" (the route announcer) in every page: pick the section's by its text.
    const alert = page.getByRole("alert").filter({ hasText: "No pudimos cargar la plata" });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("link", { name: "Reintentar" })).toHaveAttribute("href", "/staff?vista=negocio");
    // The controls and the other tabs keep working.
    await expect(page.getByRole("combobox", { name: "Período" })).toBeEnabled();
    await page.getByRole("navigation", { name: "Secciones de Negocio" }).getByRole("link", { name: "Turnos" }).click();
    await expect(tile(page, "Ocupación")).toContainText("74%");
    await page.getByRole("link", { name: /^Hoy/ }).click();
    await expect(tile(page, "Asistencia sin marcar")).toContainText("6");
  });

  test("says a range the API refuses is not valid, without Reintentar", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!, "staff-dashboard");
    await page.goto("/staff?vista=negocio&tab=turnos&periodo=fechas&desde=2020-01-01&hasta=2026-10-05");

    await expect(page.getByRole("alert").filter({ hasText: "Ese rango de fechas no es válido." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reintentar" })).toHaveCount(0);
    await page.getByRole("link", { name: "Ver el mes pasado" }).click();
    await expect(tile(page, "Ocupación")).toContainText("74%");
    expect(query(page)).toEqual({ vista: "negocio", tab: "turnos" });
  });
});

test.describe("Staff dashboard: phone", () => {
  test("no horizontal scroll on mobile", async ({ page, baseURL }) => {
    await actAsStaff(page, baseURL!, "staff-dashboard");
    await page.setViewportSize({ width: 375, height: 667 });

    // Against clientWidth, not innerWidth: with a phone emulated (the mobile project) the browser stretches innerWidth to
    // whatever overflows, so that comparison is always true there.
    const fits = async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

    await page.goto("/staff");
    await expect(tile(page, "Asistencia sin marcar")).toBeVisible();
    expect(await fits()).toBe(true);

    // Each chart is drawn after the page, so wait for it before measuring: without it the width could be taken with no chart yet.
    const charts = { plata: /^Cobrado por (día|semana|mes) del/, turnos: /^Reservas por hora/, clientes: /^Clientes activos por/ };
    for (const [tab, chart] of Object.entries(charts)) {
      await page.goto(`/staff?vista=negocio&tab=${tab}`);
      await expect(page.getByRole("img", { name: chart })).toBeVisible();
      for (const summary of await page.getByText("Ver datos", { exact: true }).all()) await summary.click();
      expect(await fits(), `the ${tab} tab`).toBe(true);
    }

    // The heatmap is wide: it scrolls inside its card, not the page.
    await page.goto("/staff?vista=negocio&tab=turnos");
    await page.getByRole("radio", { name: "Día y hora" }).click();
    const heatmap = page.getByRole("table", { name: "Ocupación por día y hora" });
    await expect(heatmap).toBeVisible();
    expect(await fits()).toBe(true);
    const scroller = heatmap.locator("xpath=..");
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  });
});
