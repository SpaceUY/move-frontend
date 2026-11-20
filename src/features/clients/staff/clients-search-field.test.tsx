import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClientsSearchField } from "./clients-search-field";
import type { ClientsListParams } from "./clients-list-params";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const ACTIVE: ClientsListParams = { q: "", page: 1, status: "active", expiringSoon: false, everyone: false };

// Fake timers drive the debounce deterministically.
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const input = () => screen.getByRole("textbox", { name: "Buscar" });

beforeEach(() => {
  replace.mockClear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("ClientsSearchField", () => {
  it("starts with the search the URL has", () => {
    render(<ClientsSearchField params={{ ...ACTIVE, q: "ana" }} />);

    expect((input() as HTMLInputElement).value).toBe("ana");
  });

  it("moves the URL once typing settles, not on every key", async () => {
    render(<ClientsSearchField params={ACTIVE} />);

    fireEvent.change(input(), { target: { value: "ana" } });
    await advance(200);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Buscando…");

    await advance(200);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/staff/clients?q=ana");
  });

  it("keeps the chosen filter and goes back to page 1", async () => {
    render(<ClientsSearchField params={{ q: "", page: 4, status: "deactivated", expiringSoon: false, everyone: false }} />);

    fireEvent.change(input(), { target: { value: "ana" } });
    await advance(400);

    expect(replace).toHaveBeenCalledWith("/staff/clients?status=deactivated&q=ana");
  });

  it("reads the filter the URL has when the timer fires, if a chip changed it meanwhile", async () => {
    const { rerender } = render(<ClientsSearchField params={ACTIVE} />);
    fireEvent.change(input(), { target: { value: "ana" } });
    await advance(100);

    rerender(<ClientsSearchField params={{ ...ACTIVE, status: "deactivated" }} />);
    await advance(400);

    expect(replace).toHaveBeenLastCalledWith("/staff/clients?status=deactivated&q=ana");
  });

  it("does not push a term the URL already has", async () => {
    render(<ClientsSearchField params={{ ...ACTIVE, q: "ana" }} />);

    fireEvent.change(input(), { target: { value: "  ana " } });
    await advance(400);

    expect(replace).not.toHaveBeenCalled();
  });

  it("clears the search straight away, without a second debounced move", async () => {
    render(<ClientsSearchField params={{ ...ACTIVE, q: "ana" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith("/staff/clients");
    expect((input() as HTMLInputElement).value).toBe("");

    await advance(400);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("shows no Limpiar without an applied search", () => {
    render(<ClientsSearchField params={ACTIVE} />);

    expect(screen.queryByRole("button", { name: "Limpiar" })).toBeNull();
  });

  it("shows what the URL says when it changes from outside, like the back button", async () => {
    const { rerender } = render(<ClientsSearchField params={{ ...ACTIVE, q: "ana" }} />);

    rerender(<ClientsSearchField params={{ ...ACTIVE, q: "bruno" }} />);
    await advance(0);

    expect((input() as HTMLInputElement).value).toBe("bruno");
    await advance(400);
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not overwrite what is being typed when the URL catches up with an earlier term", async () => {
    const { rerender } = render(<ClientsSearchField params={ACTIVE} />);
    fireEvent.change(input(), { target: { value: "an" } });
    await advance(400);
    expect(replace).toHaveBeenLastCalledWith("/staff/clients?q=an");

    fireEvent.change(input(), { target: { value: "ana" } });
    rerender(<ClientsSearchField params={{ ...ACTIVE, q: "an" }} />);
    await advance(0);

    expect((input() as HTMLInputElement).value).toBe("ana");
  });
});
