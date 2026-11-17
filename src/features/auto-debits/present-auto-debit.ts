import { AUTO_DEBIT_STATUSES, type AutoDebitDto, type AutoDebitStatus } from "@/lib/api/types";

export type AutoDebitLineTone = "active" | "pending";

export interface AutoDebitLineModel {
  text: string;
  title: string;
  detail: string | null;
  tone: AutoDebitLineTone;
  canCancel: boolean;
  debitId: string;
}

interface LineContent {
  title: string;
  tone: AutoDebitLineTone;
  nextChargeOn: string | null;
}

// nextChargeOn is a YYYY-MM-DD business date: split the string, as formatBusinessDate does.
function dayAndMonth(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

// A cancelled debit has no line: one entry per status that can be shown.
const LINE_CONTENTS: Record<AutoDebitStatus, ((debit: AutoDebitDto) => LineContent) | null> = {
  [AUTO_DEBIT_STATUSES.PENDING]: () => ({
    title: "Débito automático pendiente de autorización",
    tone: "pending",
    nextChargeOn: null,
  }),
  [AUTO_DEBIT_STATUSES.AUTHORIZED]: ({ nextChargeOn }) => ({
    title: "Débito automático activo",
    tone: "active",
    nextChargeOn,
  }),
  [AUTO_DEBIT_STATUSES.CANCELLED]: null,
};

const isNewer = (candidate: AutoDebitDto, current: AutoDebitDto): boolean => candidate.createdAt > current.createdAt;

export function presentAutoDebitLine(debits: AutoDebitDto[], service: AutoDebitDto["service"]): AutoDebitLineModel | null {
  const active = debits
    .filter((debit) => debit.service === service && LINE_CONTENTS[debit.status] !== null)
    .reduce<AutoDebitDto | null>((newest, debit) => (newest === null || isNewer(debit, newest) ? debit : newest), null);
  if (active === null) return null;

  const content = LINE_CONTENTS[active.status];
  if (content === null) return null;

  const { title, tone, nextChargeOn } = content(active);
  const nextCharge = nextChargeOn === null ? null : dayAndMonth(nextChargeOn);
  return {
    text: nextCharge === null ? title : `${title} · próximo cobro ${nextCharge}`,
    title,
    detail: nextCharge === null ? null : `Próximo cobro el ${nextCharge}`,
    tone,
    canCancel: true,
    debitId: active.id,
  };
}
