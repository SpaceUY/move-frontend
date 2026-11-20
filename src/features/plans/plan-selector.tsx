"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Heading } from "@/components/ui/heading";
import { cn } from "@/lib/cn";

import { PlanAction } from "./plan-action";
import type { SelectorOption } from "./present-selector-plans";

interface PlanSelectorProps {
  id: string;
  label: string;
  caption: string;
  title: string;
  description: string;
  options: SelectorOption[];
}

function initialIndex(options: SelectorOption[]): number {
  const featured = options.findIndex((option) => option.featured);
  return featured === -1 ? 0 : featured;
}

const HIGHLIGHT_SCROLL_OFFSET = 24;
const HIGHLIGHT_DURATION_MS = 1800;

export function PlanSelector({ id, label, caption, title, description, options }: PlanSelectorProps) {
  const groupName = useId();
  const [selectedIndex, setSelectedIndex] = useState(() => initialIndex(options));
  const [isHighlighted, setIsHighlighted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options[selectedIndex];

  // Deep links from the redirect blocks on Home/Performance/Recovery: the
  // server has no access to the URL fragment, so this only runs client-side
  // after mount — #service-N preselects that option, bare #service scrolls
  // here and flashes the border so the visitor finds the right column.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith(id)) return;

    const indexMatch = hash.match(new RegExp(`^${id}-(\\d+)$`));
    if (indexMatch) {
      const index = Number(indexMatch[1]);
      // Reacting to the URL fragment, an external system — not derivable during render, since
      // `window` doesn't exist on the server and this must only run once, after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (options[index]) setSelectedIndex(index);
      return;
    }

    if (hash !== id || !rootRef.current) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = rootRef.current.getBoundingClientRect().top + window.scrollY - HIGHLIGHT_SCROLL_OFFSET;
    window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
    setIsHighlighted(true);
    const timeout = setTimeout(() => setIsHighlighted(false), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever read on mount, from the URL present at that time
  }, []);

  return (
    <div
      id={id}
      ref={rootRef}
      className={cn(
        "flex flex-col rounded border border-line bg-card p-5 transition-colors duration-300 sm:p-7",
        isHighlighted && "border-white",
      )}
    >
      <div className="flex items-baseline justify-between gap-4 text-[11px] uppercase tracking-[0.3em] text-muted">
        <span>{label}</span>
        <span>{caption}</span>
      </div>
      <Heading as="h3" size="md" className="mt-4">
        {title}
      </Heading>
      <p className="mt-2 text-sm text-muted">{description}</p>

      <div role="radiogroup" aria-label={`Planes de ${label}`} className="mb-6 mt-7 flex flex-col gap-2">
        {options.map((option, index) => (
          <label
            key={option.id}
            className="grid cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-x-3 rounded border-2 border-line px-3 py-3.5 transition-colors sm:gap-x-4 sm:px-4 hover:border-neutral-600 has-checked:border-white has-checked:bg-white/5 has-focus-visible:ring-2 has-focus-visible:ring-white/40"
          >
            <input
              type="radio"
              name={groupName}
              checked={index === selectedIndex}
              onChange={() => setSelectedIndex(index)}
              className="peer sr-only"
            />
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-neutral-600 peer-checked:border-white peer-checked:bg-white peer-checked:shadow-[inset_0_0_0_3px_var(--color-card)]" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{option.name}</span>
            </span>
            <span className="whitespace-nowrap font-display text-xl font-black">{option.price}</span>
            {option.features.length > 0 ? (
              // On a phone the benefits take the card's full width in two columns; from sm up they sit under the name.
              <ul className="col-span-3 mt-3 columns-2 gap-x-4 text-xs text-muted sm:col-span-1 sm:col-start-2 sm:mt-2 sm:columns-1">
                {option.features.map((feature) => (
                  <li key={feature} className="mb-1 flex break-inside-avoid gap-2">
                    <span className="text-white">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>
            ) : null}
          </label>
        ))}
      </div>

      <div className="mt-auto">
        <PlanAction
          label={`${selected.actionLabel} · ${selected.price}`}
          href={selected.actionHref}
          highlighted
        />
      </div>
    </div>
  );
}
