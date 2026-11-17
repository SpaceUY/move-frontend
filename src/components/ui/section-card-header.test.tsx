import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionCardHeader } from "./section-card-header";

describe("SectionCardHeader", () => {
  it("shows the title as a heading, with its description under it", () => {
    render(<SectionCardHeader icon={<svg />} title="Seguimiento" description="Cuándo se generan alertas." />);

    expect(screen.getByRole("heading", { name: "Seguimiento" })).toBeDefined();
    expect(screen.getByText("Cuándo se generan alertas.")).toBeDefined();
  });

  it("lets the card be named by its title", () => {
    render(<SectionCardHeader icon={<svg />} title="Seguimiento" titleId="followup-title" />);

    expect(screen.getByRole("heading", { name: "Seguimiento" }).id).toBe("followup-title");
  });

  it("shows what is placed on the right", () => {
    render(<SectionCardHeader icon={<svg />} title="Seguimiento" aside={<span>Conectado</span>} />);

    expect(screen.getByText("Conectado")).toBeDefined();
  });

  it("hides the icon tile from assistive technology", () => {
    const { container } = render(<SectionCardHeader icon={<svg data-testid="icon" />} title="Seguimiento" />);

    expect(container.querySelector('[aria-hidden="true"]')?.contains(screen.getByTestId("icon"))).toBe(true);
  });
});
