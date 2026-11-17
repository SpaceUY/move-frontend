import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import type { AutoDebitCheckoutDto } from "@/lib/api/types";

import { E2E_PLAN_IDS } from "./support/checkout-fixtures";
import { OWNER_COOKIE, SCENARIO_COOKIE } from "./support/scenarios";
import { setOwner, setScenario } from "./support/use-scenario";

const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 4300)}/api/v1`;
const MENSUAL_CHECKOUT = `/checkout/plan/${E2E_PLAN_IDS.mensual}`;
const ACTIVATE_LABEL = "Activar débito automático";
const TITLE_TEXT = "Débito automático activo";
const BLOCK_TEXT = "Ya tenés débito automático activo para Performance.";
const PROVIDER_CANCEL_ERROR =
  "No pudimos cancelar el débito en Mercado Pago. Sigue activo: probá de nuevo en unos minutos.";
const POLL_WAIT_MS = 15_000;
// Next keeps an empty role="alert" (the route announcer) in every page: only the ones with text are ours.
const withText = { hasText: /\S/ };

function asClient(scenario: string, owner: string): { Cookie: string } {
  return { Cookie: `${SCENARIO_COOKIE}=${scenario}; ${OWNER_COOKIE}=${owner}` };
}

async function actAs(page: Page, baseURL: string, scenario: Parameters<typeof setScenario>[2]): Promise<string> {
  const owner = randomUUID();
  await setScenario(page.context(), baseURL, scenario);
  await setOwner(page.context(), baseURL, owner);
  return owner;
}

async function startDebitFromApi(request: APIRequestContext, owner: string, scenario: string): Promise<string> {
  const response = await request.post(`${API}/me/auto-debits`, {
    headers: asClient(scenario, owner),
    data: { planId: E2E_PLAN_IDS.mensual },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as AutoDebitCheckoutDto).externalReference;
}

async function simulateFromApi(
  request: APIRequestContext,
  owner: string,
  scenario: string,
  externalReference: string,
  action: string,
): Promise<void> {
  const response = await request.post(`${API}/payments/dev/simulate-auto-debit`, {
    headers: asClient(scenario, owner),
    data: { externalReference, action },
  });
  expect(response.status()).toBe(200);
}

async function chooseDebit(page: Page): Promise<void> {
  await page.goto(MENSUAL_CHECKOUT);
  await page.getByRole("radio", { name: "Débito automático" }).check();
}

test.describe("Automatic debit", () => {
  test("contrata, bloquea el pago único de Performance y se cancela", async ({ page, baseURL }) => {
    await actAs(page, baseURL!, "active");

    await page.goto(MENSUAL_CHECKOUT);
    await expect(page.getByRole("group", { name: "¿Cómo querés pagar?" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Pago único" })).toBeChecked();
    await page.getByRole("radio", { name: "Débito automático" }).check();
    await expect(
      page.getByText(
        "Se cobra automáticamente cada mes con Mercado Pago. Podés cancelarlo cuando quieras desde tu perfil. El primer cobro se hace cuando termina el último plan que ya pagaste.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: ACTIVATE_LABEL }).click();

    await expect(page).toHaveURL(/\/checkout\/simulado\?debito=[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Autorizar" }).click();

    await expect(page).toHaveURL(/\/checkout\/resultado\?debito=[0-9a-f-]{36}$/);
    const result = page.getByRole("status");
    await expect(result.getByRole("heading", { name: "Débito automático activo" })).toBeVisible();
    await expect(result.getByText("$ 3.900")).toBeVisible();
    await expect(result.getByText("12/11/2026")).toBeVisible();

    await result.getByRole("link", { name: "Ir a mi perfil" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(TITLE_TEXT, { exact: true })).toBeVisible();

    await page.goto(MENSUAL_CHECKOUT);
    await expect(page.getByText(BLOCK_TEXT)).toBeVisible();
    await expect(page.getByRole("button", { name: "Pagar con Mercado Pago" })).toHaveCount(0);
    await page.getByRole("link", { name: "Gestionarlo en mi perfil" }).click();

    await expect(page.getByText(TITLE_TEXT, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar débito" }).click();
    await expect(page.getByText("¿Cancelar el débito automático?")).toBeVisible();
    await expect(page.getByText("Lo que ya pagaste sigue vigente hasta el 15/11/2026.")).toBeVisible();
    await page.getByRole("button", { name: "Sí, cancelar débito" }).click();

    // Two elements carry this text: the success snackbar's title and the grey line left in the card.
    await expect(page.getByText("Débito automático cancelado.", { exact: true })).toHaveCount(2);
    await expect(
      page.getByRole("status").filter({ hasText: "Lo que ya pagaste sigue vigente hasta el 15/11/2026." }),
    ).toBeVisible();
    await expect(page.getByText(TITLE_TEXT, { exact: true })).toHaveCount(0);
    await expect(page.getByText("¿Cancelar el débito automático?")).toHaveCount(0);
  });

  test("keeps the debit and explains the error when Mercado Pago does not cancel", async ({ page, baseURL }) => {
    await actAs(page, baseURL!, "auto-debit-provider-down");

    await page.goto("/dashboard");
    await expect(page.getByText(TITLE_TEXT, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar débito" }).click();
    await page.getByRole("button", { name: "Sí, cancelar débito" }).click();

    // The error is a snackbar: its text comes with an icon and a close button around it.
    await expect(page.getByRole("alert").filter(withText)).toContainText(PROVIDER_CANCEL_ERROR);
    await expect(page.getByText(TITLE_TEXT, { exact: true })).toBeVisible();
    await expect(page.getByText("¿Cancelar el débito automático?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sí, cancelar débito" })).toBeEnabled();
  });

  test("shows the block when the debit became active in another tab", async ({ page, baseURL, request }) => {
    const owner = await actAs(page, baseURL!, "none");
    await chooseDebit(page);
    await expect(page.getByRole("button", { name: ACTIVATE_LABEL })).toBeVisible();

    const reference = await startDebitFromApi(request, owner, "none");
    await simulateFromApi(request, owner, "none", reference, "authorize");
    await page.getByRole("button", { name: ACTIVATE_LABEL }).click();

    await expect(page.getByText(BLOCK_TEXT)).toBeVisible();
    await expect(page.getByRole("link", { name: "Gestionarlo en mi perfil" })).toHaveAttribute("href", "/dashboard");
    await expect(page.getByRole("button", { name: ACTIVATE_LABEL })).toHaveCount(0);
    await expect(page.getByRole("alert").filter(withText)).toHaveCount(0);
  });

  test("never says the debit is active before the API does", async ({ page, baseURL, request }) => {
    const owner = await actAs(page, baseURL!, "none");
    const reference = await startDebitFromApi(request, owner, "none");

    await page.goto(`/checkout/resultado?debito=${reference}`);
    await expect(page.getByRole("heading", { name: "Confirmando tu débito" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Débito automático activo" })).toHaveCount(0);

    await simulateFromApi(request, owner, "none", reference, "authorize");

    await expect(page.getByRole("heading", { name: "Débito automático activo" })).toBeVisible({
      timeout: POLL_WAIT_MS,
    });
  });

  test("says the debit does not exist, without a retry", async ({ page, baseURL }) => {
    await actAs(page, baseURL!, "none");

    await page.goto(`/checkout/resultado?debito=${randomUUID()}`);

    await expect(page.getByRole("heading", { name: "No encontramos el débito" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir a mi perfil" })).toBeVisible();
    await expect(page.getByRole("status").getByRole("button")).toHaveCount(0);
  });

  test("tells a cancelled debit apart and links back to the plan", async ({ page, baseURL, request }) => {
    const owner = await actAs(page, baseURL!, "none");
    const reference = await startDebitFromApi(request, owner, "none");
    await simulateFromApi(request, owner, "none", reference, "cancel");

    await page.goto(`/checkout/resultado?debito=${reference}`);

    await expect(page.getByRole("heading", { name: "Débito no activado" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver a intentar" })).toHaveAttribute("href", MENSUAL_CHECKOUT);
  });

  test("keeps Recovery sellable and shows the pending debit in the packs card", async ({ page, baseURL }) => {
    await actAs(page, baseURL!, "auto-debit-pending");

    await page.goto("/dashboard");
    await expect(page.getByText("Débito automático pendiente de autorización")).toBeVisible();

    await page.goto(`/checkout/plan/${E2E_PLAN_IDS.pack4}`);
    await expect(page.getByRole("radio", { name: "Débito automático" })).toBeVisible();
    await expect(page.getByText("Se cobra automáticamente cada 30 días con Mercado Pago.", { exact: false })).toBeVisible();
    await expect(page.getByText("El primer cobro", { exact: false })).toHaveCount(0);
    await page.getByRole("radio", { name: "Débito automático" }).check();
    await expect(page.getByRole("button", { name: ACTIVATE_LABEL })).toBeVisible();
  });
});
