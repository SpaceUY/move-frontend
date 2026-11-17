"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { InboxItemDto } from "@/lib/api/types";
import { cn } from "@/lib/cn";

import { InboxList } from "./inbox-list";
import { useInboxContext } from "./inbox-provider";
import { inboxBellLabel, inboxCountText } from "./inbox-labels";
import { UnreadBadge } from "./unread-badge";

export function DesktopInboxControl() {
  const { unreadCount, list, loadList, markRead, openAction } = useInboxContext();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [previousPathname, setPreviousPathname] = useState(pathname);

  if (pathname !== previousPathname) {
    setPreviousPathname(pathname);
    setIsOpen(false);
  }

  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  // Same outside-click + Escape idiom as `mobile-profile-header`'s overlays:
  // a click outside just closes, Escape closes and returns focus to the bell.
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function toggle() {
    if (!isOpen) void loadList();
    setIsOpen((current) => !current);
  }

  function handleOpenAction(item: InboxItemDto) {
    setIsOpen(false);
    openAction(item);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="desktop-inbox-panel"
        aria-label={inboxBellLabel(unreadCount)}
        onClick={toggle}
        className={cn("relative rounded border border-line p-2 hover:bg-card", isOpen && "bg-card")}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <UnreadBadge count={unreadCount} />
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          id="desktop-inbox-panel"
          role="dialog"
          aria-label="Notificaciones"
          tabIndex={-1}
          className="absolute right-0 top-[calc(100%+8px)] z-50 flex max-h-[470px] w-[360px] flex-col rounded-lg border border-[#3a3a3a] bg-raised shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_60px_rgba(0,0,0,0.85)]"
        >
          <div className="flex flex-none items-center justify-between border-b border-line px-4 py-3.5">
            <span className="text-[10px] font-bold uppercase tracking-[2.5px] text-muted">Notificaciones</span>
            <span className="text-[11px] text-muted">{inboxCountText(unreadCount)}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <InboxList state={list} onRetry={() => void loadList()} onMarkRead={(id) => void markRead(id)} onOpenAction={handleOpenAction} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
