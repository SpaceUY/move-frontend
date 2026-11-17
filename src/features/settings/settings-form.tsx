"use client";

import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useInvalidFieldsFeedback } from "@/components/ui/form-feedback";
import { Input } from "@/components/ui/input";
import { SectionCardHeader } from "@/components/ui/section-card-header";
import { BellIcon, CalendarIcon, TagIcon, WalletIcon } from "@/components/ui/section-icons";
import { useSnackbar } from "@/components/ui/snackbar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import type { SettingsValues } from "@/lib/api/types";

import { rangeError, relationErrors, SETTING_PARSERS } from "./setting-parsers";
import {
  SETTING_FIELDS,
  SETTING_KEYS,
  SETTING_SECTIONS,
  type SettingKey,
  type SettingSection,
  type SettingsPatch,
  type SettingValue,
  settingKeysOf,
  settingLabel,
} from "./settings-fields";
import { type SettingsFieldErrors, updateSettings } from "./update-settings";

type FormValues = Record<SettingKey, string>;

const INPUT_MODES = {
  integer: "numeric",
  optionalInteger: "numeric",
  decimal: "decimal",
  amount: "decimal",
  boolean: undefined,
  text: undefined,
} as const;
const SECTIONS = Object.keys(SETTING_SECTIONS) as SettingSection[];
const SECTION_ICONS: Record<SettingSection, ReactNode> = {
  bookings: <CalendarIcon />,
  followup: <BellIcon />,
  offlinePrices: <TagIcon />,
  offlinePayments: <WalletIcon />,
};
const TEXT_ROWS = 4;

// A field that depends on a switch is hidden while the switch is off; what it holds stays.
function isShown(key: SettingKey, formValues: FormValues): boolean {
  const { dependsOn } = SETTING_FIELDS[key];
  return dependsOn === undefined || formValues[dependsOn] === "true";
}

function ModifiedTag() {
  return (
    <span className="inline-flex items-center rounded-sm border border-warning/35 bg-warning/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-warning">
      Modificado
    </span>
  );
}

// A section with switch blocks has room for two columns, as in the mockup; the others fit three.
// The four prices read better two by two than as three and one left over.
const hasSwitchGroup = (section: SettingSection): boolean =>
  settingKeysOf(section).some((key) => SETTING_FIELDS[key].group !== undefined);
const hasThreeColumns = (section: SettingSection): boolean =>
  !hasSwitchGroup(section) && section !== "offlinePrices";

// A decimal is shown the way it is typed in es-UY, with a comma; an empty value is an empty field.
const toFormValues = (values: SettingsValues): FormValues => {
  const formValues = {} as FormValues;
  for (const key of SETTING_KEYS) {
    const text = String(values[key] ?? "");
    formValues[key] = SETTING_FIELDS[key].kind === "decimal" || SETTING_FIELDS[key].kind === "amount" ? text.replace(".", ",") : text;
  }
  return formValues;
};

function parseForm(
  formValues: FormValues,
  saved: SettingsValues,
): { errors: SettingsFieldErrors; patch: SettingsPatch } {
  const errors: SettingsFieldErrors = {};
  const parsedValues: Partial<Record<SettingKey, SettingValue>> = {};
  for (const key of SETTING_KEYS) {
    const { kind, range } = SETTING_FIELDS[key];
    const parsed = SETTING_PARSERS[kind](formValues[key]);
    const error = parsed.ok ? rangeError(kind, range, parsed.value) : parsed.error;
    if (error === null && parsed.ok) parsedValues[key] = parsed.value;
    // A wrong value in a hidden field can't be seen or fixed, so it is left out.
    else if (error !== null && isShown(key, formValues)) errors[key] = error;
  }
  Object.assign(errors, relationErrors(parsedValues));

  const patch: SettingsPatch = {};
  for (const key of SETTING_KEYS) {
    const value = parsedValues[key];
    if (value !== undefined && value !== saved[key]) patch[key] = value;
  }
  return { errors, patch };
}

export interface SettingsFormProps {
  initialValues: SettingsValues;
}

export function SettingsForm({ initialValues }: SettingsFormProps) {
  const formHeadingId = useId();
  const [saved, setSaved] = useState(initialValues);
  const [formValues, setFormValues] = useState(() => toFormValues(initialValues));
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const { showSnackbar } = useSnackbar();
  const reportInvalid = useInvalidFieldsFeedback();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const savedFormValues = toFormValues(saved);
  const isDirty = SETTING_KEYS.some((key) => formValues[key] !== savedFormValues[key]);
  const isSectionDirty = (section: SettingSection): boolean =>
    settingKeysOf(section).some((key) => formValues[key] !== savedFormValues[key]);

  // Warn the user before leaving the page if there are unsaved changes. This covers
  // browser-level navigation: refresh, tab close, back button, direct URL entry.
  // See the test "warns on beforeunload if dirty" for the expected behavior.
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // A field in error loses it as soon as the new value passes the submit's own checks.
  function editField(key: keyof typeof formValues, value: string) {
    const next = { ...formValues, [key]: value };
    setFormValues(next);
    if (fieldErrors[key]) setFieldErrors((current) => ({ ...current, [key]: parseForm(next, saved).errors[key] }));
  }

  function handleDiscard() {
    setFormValues(savedFormValues);
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const { errors, patch } = parseForm(formValues, saved);

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      reportInvalid(event.currentTarget, errors);
      return;
    }
    if (Object.keys(patch).length === 0) {
      showSnackbar({ tone: "info", title: "No hay cambios para guardar." });
      return;
    }

    // Read before the await: React clears currentTarget once the handler returns.
    const form = event.currentTarget;
    setIsSubmitting(true);
    const result = await updateSettings(patch);
    setIsSubmitting(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors);
      reportInvalid(form, result.fieldErrors);
      if (result.message) showSnackbar({ tone: "danger", title: result.message });
      return;
    }
    setSaved(result.values);
    setFormValues(toFormValues(result.values));
    showSnackbar({ tone: "success", title: "Cambios guardados." });
  }

  function renderField(key: SettingKey) {
    const { description: fieldDescription, kind } = SETTING_FIELDS[key];
    const descriptionId = fieldDescription ? `${key}-description` : undefined;
    const description = fieldDescription ? (
      <p id={descriptionId} className="mt-1.5 text-xs text-muted">
        {fieldDescription}
      </p>
    ) : null;
    if (kind === "text") {
      return (
        <div key={key}>
          <Textarea
            name={key}
            label={settingLabel(key)}
            rows={TEXT_ROWS}
            value={formValues[key]}
            onChange={(event) => editField(key, event.target.value)}
            error={fieldErrors[key]}
            aria-describedby={descriptionId}
          />
          {description}
        </div>
      );
    }
    return (
      <div key={key}>
        <Input
          name={key}
          label={settingLabel(key)}
          labelRowClassName="min-h-8 items-end"
          inputMode={INPUT_MODES[kind]}
          value={formValues[key]}
          onChange={(event) => editField(key, event.target.value)}
          error={fieldErrors[key]}
          aria-describedby={descriptionId}
        />
        {description}
      </div>
    );
  }

  // A yes/no setting with its heading, and under it the fields that only apply while it is on.
  function renderSwitchGroup(key: SettingKey) {
    const { group } = SETTING_FIELDS[key];
    const headingId = `setting-${key}-group`;
    const dependents = SETTING_KEYS.filter((other) => SETTING_FIELDS[other].dependsOn === key);
    // The block that holds a text area takes the full width, even while the text is hidden.
    const hasText = dependents.some((other) => SETTING_FIELDS[other].kind === "text");
    return (
      <div
        key={key}
        role="group"
        aria-labelledby={group ? headingId : undefined}
        className={cn(hasText && "col-span-full")}
      >
        {group ? (
          <p id={headingId} className="flex min-h-8 items-end text-[13px] font-semibold">
            {group}
          </p>
        ) : null}
        <div className="mt-2.5 flex items-center gap-3">
          <Switch
            id={`setting-${key}`}
            label={settingLabel(key)}
            checked={formValues[key] === "true"}
            onChange={(checked) => editField(key, String(checked))}
          />
          <label htmlFor={`setting-${key}`} className="cursor-pointer text-sm font-medium">
            {settingLabel(key)}
          </label>
        </div>
        {dependents.filter((other) => isShown(other, formValues)).map((other) => (
          <div key={other} className="mt-2.5">
            {renderField(other)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby={formHeadingId} className="space-y-5">
      <h2 id={formHeadingId} className="sr-only">
        Reglas del negocio
      </h2>
      {SECTIONS.map((section) => {
        const { title, description } = SETTING_SECTIONS[section];
        const titleId = `${formHeadingId}-${section}`;
        return (
          <Card key={section} padding="none" role="group" aria-labelledby={titleId}>
            <SectionCardHeader
              icon={SECTION_ICONS[section]}
              title={title}
              titleId={titleId}
              description={description}
              aside={isSectionDirty(section) ? <ModifiedTag /> : null}
            />
            <div className="p-6">
              <div className={cn("grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2", hasThreeColumns(section) && "lg:grid-cols-3")}>
                {settingKeysOf(section)
                  .filter((key) => SETTING_FIELDS[key].dependsOn === undefined)
                  .map((key) =>
                    SETTING_FIELDS[key].kind === "boolean" ? renderSwitchGroup(key) : renderField(key),
                  )}
              </div>
            </div>
          </Card>
        );
      })}

      <div className="sticky bottom-0 rounded border border-line-strong bg-raised px-6 py-4">
        <div
          className={cn(
            "flex flex-wrap items-center gap-4",
            isDirty ? "justify-between" : "justify-end",
          )}
        >
          {isDirty ? (
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
              Tenés cambios sin guardar
            </p>
          ) : null}
          <div className="flex gap-3">
            {isDirty ? (
              <Button
                type="button"
                variant="ghost"
                touchTarget
                disabled={isSubmitting}
                onClick={handleDiscard}
              >
                Descartar
              </Button>
            ) : null}
            <Button type="submit" touchTarget disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
