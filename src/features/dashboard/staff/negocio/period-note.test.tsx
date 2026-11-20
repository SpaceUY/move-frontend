import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { StatsMetaDto } from "@/lib/api/types";

import { PeriodNote } from "./period-note";

const META: StatsMetaDto = {
  period: { from: "2026-10-01", to: "2026-10-31", inProgress: false },
  comparison: { from: "2026-09-01", to: "2026-09-30", inProgress: false, hasData: true },
  dataSince: "2026-03-12",
  granularity: "week",
  granularityOptions: ["day", "week"],
};

describe("PeriodNote", () => {
  it("shows the period, the comparison and since when there is data", () => {
    render(<PeriodNote meta={META} source="plata" />);

    expect(screen.getByText("1 oct – 31 oct · comparado con 1 sep – 30 sep · Datos de plata desde 12 mar 2026 (el primer cobro registrado)")).toBeDefined();
  });

  it("leaves the comparison out when the person chose not to compare", () => {
    render(<PeriodNote meta={{ ...META, comparison: null }} source="plata" />);

    expect(screen.getByText("1 oct – 31 oct · Datos de plata desde 12 mar 2026 (el primer cobro registrado)")).toBeDefined();
  });

  it("says there is no data to compare with", () => {
    render(<PeriodNote meta={{ ...META, comparison: { ...META.comparison!, hasData: false } }} source="plata" />);

    expect(screen.getByText(/comparado con — sin datos/)).toBeDefined();
  });

  it("adds the year when the windows are in different years", () => {
    render(
      <PeriodNote
        meta={{
          ...META,
          comparison: { from: "2025-10-01", to: "2025-10-31", inProgress: false, hasData: false },
          dataSince: null,
        }}
        source="plata"
      />,
    );

    expect(screen.getByText("1 oct 2026 – 31 oct 2026 · comparado con — sin datos")).toBeDefined();
  });

  it("says Datos de turnos desde 12 mar 2026 on the Turnos tab, with why: the first turno loaded", () => {
    render(<PeriodNote meta={META} source="turnos" />);

    expect(screen.getByText(/Datos de turnos desde 12 mar 2026 \(el primer turno\)/)).toBeDefined();
  });

  it("writes nothing about data when dataSince is null", () => {
    render(<PeriodNote meta={{ ...META, dataSince: null }} source="turnos" />);

    expect(screen.getByText("1 oct – 31 oct · comparado con 1 sep – 30 sep")).toBeDefined();
    expect(screen.queryByText(/Datos de/)).toBeNull();
  });
});
