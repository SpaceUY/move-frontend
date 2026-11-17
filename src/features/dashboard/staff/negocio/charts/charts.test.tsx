import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DonutChart } from "./donut-chart";
import { LineWithBarsChart } from "./line-with-bars-chart";
import { StackedColumnsChart } from "./stacked-columns-chart";
import { formatValue, VALUE_FORMATS } from "./value-format";

vi.mock("recharts", () => import("./fixed-size-recharts").then((module) => module.fixedSizeRecharts()));

const SERIES = [
  { key: "performance", name: "Performance", color: "var(--color-performance)" },
  { key: "rehab", name: "Rehab", color: "var(--color-rehab)" },
];

const BUCKETS = [
  { label: "1 oct", range: "1 oct – 7 oct", inProgress: false, values: { performance: 1000, rehab: 500 }, total: 1500, previous: 1200 },
  { label: "8 oct", range: "8 oct – 14 oct", inProgress: true, values: { performance: 300, rehab: 0 }, total: 300, previous: null },
];

const sectors = (container: HTMLElement) => container.querySelectorAll(".recharts-pie-sector");
const barRectangles = (container: HTMLElement) => container.querySelectorAll(".recharts-bar-rectangle");
const dashedLines = (container: HTMLElement) =>
  [...container.querySelectorAll(".recharts-line-curve")].filter((line) => line.getAttribute("stroke-dasharray") === "4 4");

// jsdom has no layout: Recharts turns the pointer into chart coordinates with these two.
function hoverChart(container: HTMLElement) {
  const wrapper = container.querySelector(".recharts-wrapper") as HTMLElement;
  Object.defineProperty(wrapper, "offsetWidth", { value: 600 });
  Object.defineProperty(wrapper, "offsetHeight", { value: 300 });
  wrapper.getBoundingClientRect = () => new DOMRect(0, 0, 600, 300);
  fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 150 });
}

describe("charts", () => {
  it("formatValue prints money always with two decimals", () => {
    expect(formatValue(4958.06, VALUE_FORMATS.MONEY)).toBe("$ 4.958,06");
    expect(formatValue(153700, VALUE_FORMATS.MONEY)).toBe("$ 153.700,00");
  });

  it("DonutChart draws the label as an image with one slice per part that has a value", () => {
    const { container } = render(
      <DonutChart
        label="Cobrado por servicio: Performance 70%, Rehab 30%"
        valueFormat="money"
        parts={[
          { name: "Performance", value: 70, share: 0.7, color: "var(--color-performance)" },
          { name: "Rehab", value: 30, share: 0.3, color: "var(--color-rehab)" },
          { name: "Recovery", value: 0, share: 0, color: "var(--color-recovery)" },
        ]}
      />,
    );

    const image = screen.getByRole("img", { name: "Cobrado por servicio: Performance 70%, Rehab 30%" });
    expect(image.querySelector("svg")).not.toBeNull();
    expect(sectors(container)).toHaveLength(2);
  });

  it("DonutChart prints the share the API sent in the tooltip, it does not divide", () => {
    const { container } = render(
      <DonutChart
        label="x"
        valueFormat="money"
        parts={[
          { name: "Performance", value: 70, share: 0.55, color: "var(--color-performance)" },
          { name: "Rehab", value: 30, share: 0.45, color: "var(--color-rehab)" },
        ]}
      />,
    );

    fireEvent.mouseOver(container.querySelector(".recharts-pie-sector")!);

    expect(screen.getByText("55%")).toBeDefined();
  });

  it("DonutChart draws an empty ring when there is nothing to split", () => {
    const { container } = render(
      <DonutChart label="sin cobros" valueFormat="money" parts={[{ name: "Performance", value: 0, share: null, color: "var(--color-performance)" }]} />,
    );

    expect(sectors(container)).toHaveLength(1);
    expect(sectors(container)[0].querySelector("path")?.getAttribute("fill")).toBe("var(--color-line)");
  });

  it("StackedColumnsChart draws a rectangle for each segment with a value, hatched while the bucket is in progress", () => {
    const { container } = render(
      <StackedColumnsChart label="x" buckets={BUCKETS} series={SERIES} previousName={null} valueFormat="money" />,
    );

    const image = screen.getByRole("img", { name: "x" });
    expect(image.querySelector("svg")).not.toBeNull();
    // 2 buckets × 2 services, and the 0 of Rehab in the second bucket has no rectangle.
    expect(barRectangles(container)).toHaveLength(3);
    const fills = [...container.querySelectorAll(".recharts-bar-rectangle path")].map((path) => path.getAttribute("fill"));
    expect(fills.filter((fill) => fill?.startsWith("url(#"))).toHaveLength(1);
    expect(dashedLines(container)).toHaveLength(0);
  });

  it("StackedColumnsChart prints the total of the bucket the API sent, it does not add the series", async () => {
    const { container } = render(
      <StackedColumnsChart
        label="x"
        buckets={[{ ...BUCKETS[0], total: 1777 }]}
        series={SERIES}
        previousName={null}
        valueFormat="count"
      />,
    );

    hoverChart(container);

    expect((await screen.findByText("Total")).nextElementSibling?.textContent).toBe("1777");
  });

  it("StackedColumnsChart leaves the Total row out when the API sent no total for the bucket", async () => {
    const { container } = render(
      <StackedColumnsChart
        label="x"
        buckets={[{ ...BUCKETS[0], total: null }]}
        series={SERIES}
        previousName={null}
        valueFormat="count"
      />,
    );

    hoverChart(container);

    expect(await screen.findByText("Performance")).toBeDefined();
    expect(screen.queryByText("Total")).toBeNull();
  });

  it("StackedColumnsChart draws the dashed line of the previous period only when it has a name", () => {
    const { container } = render(
      <StackedColumnsChart label="x" buckets={BUCKETS} series={SERIES} previousName="mes anterior" valueFormat="money" />,
    );

    expect(dashedLines(container)).toHaveLength(1);
  });

  it("StackedColumnsChart legend names the series, the previous line and the period in progress", () => {
    render(
      <StackedColumnsChart label="x" buckets={BUCKETS} series={SERIES} previousName="mes anterior" valueFormat="money" />,
    );

    const legend = screen.getByRole("list", { name: "Referencias del gráfico" });
    expect(legend.textContent).toContain("Performance");
    expect(legend.textContent).toContain("Rehab");
    expect(legend.textContent).toContain("mes anterior");
    expect(legend.textContent).toContain("en curso");
  });

  it("StackedColumnsChart legend leaves out what the chart does not draw", () => {
    render(
      <StackedColumnsChart
        label="x"
        buckets={[{ ...BUCKETS[0], previous: null }]}
        series={SERIES}
        previousName={null}
        valueFormat="count"
      />,
    );

    const legend = screen.getByRole("list", { name: "Referencias del gráfico" });
    expect(legend.textContent).not.toContain("en curso");
    expect(legend.querySelectorAll("li")).toHaveLength(2);
  });

  it("LineWithBarsChart draws the line, the previous line and the bars", () => {
    const { container } = render(
      <LineWithBarsChart
        label="Activos: 80, con 6 altas y 2 bajas"
        previousName="Período anterior"
        points={[
          { label: "oct", inProgress: false, line: 80, previousLine: 70, up: 6, down: 2 },
          { label: "nov", inProgress: true, line: 82, previousLine: null, up: 3, down: 1 },
        ]}
      />,
    );

    const image = screen.getByRole("img", { name: "Activos: 80, con 6 altas y 2 bajas" });
    expect(image.querySelectorAll("svg")).toHaveLength(2);
    expect(dashedLines(container)).toHaveLength(1);
    expect(barRectangles(container).length).toBeGreaterThan(0);
  });

  it("LineWithBarsChart names the comparison it was given in the tooltip", async () => {
    const { container } = render(
      <LineWithBarsChart
        label="x"
        previousName="Mismo período del año pasado"
        points={[
          { label: "oct", inProgress: false, line: 80, previousLine: 70, up: 6, down: 2 },
          { label: "nov", inProgress: false, line: 82, previousLine: 71, up: 3, down: 1 },
        ]}
      />,
    );

    hoverChart(container);

    expect(await screen.findByText("Mismo período del año pasado")).toBeDefined();
    expect(screen.queryByText("Período anterior")).toBeNull();
  });

  it("LineWithBarsChart says in the tooltip that a point is still in progress", async () => {
    const { container } = render(
      <LineWithBarsChart
        label="x"
        previousName={null}
        points={[{ label: "nov", inProgress: true, line: 82, previousLine: null, up: 3, down: 1 }]}
      />,
    );

    hoverChart(container);

    expect(await screen.findByText("nov · en curso")).toBeDefined();
  });

  it("LineWithBarsChart legend names the line, the previous line and the two bars, so no meaning rests on color alone", () => {
    render(
      <LineWithBarsChart
        label="x"
        previousName="Período anterior"
        points={[{ label: "oct", inProgress: false, line: 80, previousLine: 70, up: 6, down: 2 }]}
      />,
    );

    const legend = screen.getByRole("list", { name: "Referencias del gráfico" });
    expect([...legend.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["Activos", "Período anterior", "Altas", "Bajas"]);
  });

  it("LineWithBarsChart legend leaves the previous line out when there is nothing to compare with", () => {
    render(
      <LineWithBarsChart
        label="x"
        previousName={null}
        points={[{ label: "oct", inProgress: false, line: 80, previousLine: null, up: 6, down: 2 }]}
      />,
    );

    const legend = screen.getByRole("list", { name: "Referencias del gráfico" });
    expect([...legend.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["Activos", "Altas", "Bajas"]);
  });

  it("a point with downPending draws a hatched bar under the bajas", () => {
    const { container } = render(
      <LineWithBarsChart
        label="x"
        previousName={null}
        points={[
          { label: "oct", inProgress: false, line: 80, previousLine: null, up: 6, down: 2, downPending: 0 },
          { label: "nov", inProgress: true, line: 82, previousLine: null, up: 3, down: 1, downPending: 3 },
        ]}
      />,
    );

    const fills = [...container.querySelectorAll(".recharts-bar-rectangle path")].map((path) => path.getAttribute("fill"));
    // Joins and leaves of both points are solid; only the 3 in progress of "nov" is hatched (the 0 has no rectangle).
    expect(fills.filter((fill) => fill?.startsWith("url(#"))).toHaveLength(1);
    expect(fills.filter((fill) => !fill?.startsWith("url(#"))).toHaveLength(4);
  });

  it("LineWithBarsChart names Bajas en curso in the legend and the tooltip only when a point has some", async () => {
    const { container, unmount } = render(
      <LineWithBarsChart
        label="x"
        previousName={null}
        points={[{ label: "nov", inProgress: true, line: 82, previousLine: null, up: 3, down: 1, downPending: 3 }]}
      />,
    );

    const legend = screen.getByRole("list", { name: "Referencias del gráfico" });
    expect([...legend.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["Activos", "Altas", "Bajas", "Bajas en curso"]);
    hoverChart(container);
    const pendingRow = (await screen.findByText("−3")).closest("p");
    expect(pendingRow).not.toBeNull();
    expect(within(pendingRow as HTMLElement).getByText("Bajas en curso")).toBeDefined();
    unmount();

    render(
      <LineWithBarsChart
        label="x"
        previousName={null}
        points={[{ label: "nov", inProgress: true, line: 82, previousLine: null, up: 3, down: 1, downPending: 0 }]}
      />,
    );
    const noPending = screen.getByRole("list", { name: "Referencias del gráfico" });
    expect([...noPending.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["Activos", "Altas", "Bajas"]);
  });

  it("LineWithBarsChart draws no previous line when there is no comparison to name", () => {
    const { container } = render(
      <LineWithBarsChart
        label="x"
        previousName={null}
        points={[
          { label: "oct", inProgress: false, line: 80, previousLine: 70, up: 6, down: 2 },
          { label: "nov", inProgress: false, line: 82, previousLine: 71, up: 3, down: 1 },
        ]}
      />,
    );

    expect(dashedLines(container)).toHaveLength(0);
  });
});
