"use client";

import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/format";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  /** "sheet" slides up from the bottom on mobile; "panel" is centred. */
  variant?: "sheet" | "panel";
  className?: string;
};

/**
 * Modal dialog with a focus trap, Escape-to-close and scroll locking.
 *
 * Rendered inline rather than in a portal to document.body so the component
 * behaves identically when the app is embedded in an iframe. Nothing here
 * touches window.top or window.parent.
 */
export default function Modal({
  open,
  onClose,
  labelledBy,
  children,
  variant = "panel",
  className,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  const focusables = useCallback(() => {
    const root = panelRef.current;
    if (!root) return [] as HTMLElement[];
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }, []);

  // Remember what had focus, move focus into the dialog, restore it on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;

    const timer = window.setTimeout(() => {
      const [first] = focusables();
      (first ?? panelRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      restoreFocusTo.current?.focus?.();
    };
  }, [open, focusables]);

  // Escape to close, Tab cycles within the dialog.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, focusables]);

  // Lock background scrolling while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex",
        variant === "sheet" ? "items-end sm:items-center" : "items-center",
        "justify-center",
      )}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/80 backdrop-blur-[2px]"
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          "relative z-10 max-h-[92dvh] w-full overflow-y-auto border border-nd-line bg-nd-surface shadow-2xl focus:outline-none",
          variant === "sheet"
            ? "rounded-t-[10px] sm:max-w-2xl sm:rounded-[4px]"
            : "max-w-2xl rounded-[4px]",
          "sm:max-h-[88dvh]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Standard dialog close button, top-right. */
export function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-[3px] border border-nd-line bg-nd-black text-nd-body transition-colors duration-200 hover:border-white hover:text-white"
      aria-label="Close"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  );
}
