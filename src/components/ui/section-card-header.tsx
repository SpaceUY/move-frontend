import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface SectionCardHeaderProps {
  /** One of the section icons; it sits in a bordered tile. */
  icon: ReactNode;
  title: string;
  /** Lets the card name itself (aria-labelledby) from its own title. */
  titleId?: string;
  description?: string;
  /** Right of the title: a status or a "modified" tag. */
  aside?: ReactNode;
  className?: string;
}

/** The head of a staff card that holds one section of a page: the icon tile, a title
 *  that stands out from the text under it, and a band that marks where the card begins.
 *  Put it first inside a `<Card padding="none">`. */
export function SectionCardHeader({
  icon,
  title,
  titleId,
  description,
  aside,
  className,
}: SectionCardHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-t border-b border-line bg-raised px-6 py-5",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded border border-line-strong bg-bg text-white [&_svg]:size-[22px]"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-[19px] font-bold leading-tight">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-[13px] text-[#bdbdbd]">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}
