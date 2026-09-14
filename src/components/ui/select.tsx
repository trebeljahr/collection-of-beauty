"use client";

import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  "aria-label": string;
  className?: string;
  /** Classes for the popover list, e.g. a min-width wider than the trigger. */
  listClassName?: string;
  /** Which trigger edge the list lines up with. Use "end" near the right edge. */
  align?: "start" | "end";
};

/*
 * A listbox in place of a native <select>. The native popup is drawn by the
 * OS — a grey system menu on macOS, a wheel on iOS — and ignores every theme
 * token, so the controls read as foreign next to the rest of the page.
 *
 * Keyboard follows the WAI-ARIA select-only combobox pattern: Enter, Space or
 * the arrows open it; arrows, Home/End and typed letters move the highlight;
 * Enter/Space pick; Escape and Tab close. Focus moves onto the list while it
 * is open (with aria-activedescendant) and back to the trigger on close.
 */
export function Select({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  className,
  listClassName,
  align = "start",
}: Props) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [placeAbove, setPlaceAbove] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const typeahead = React.useRef({ text: "", timer: 0 });

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex];

  function openList(index = selectedIndex) {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      // 18rem is the list's max height plus its offset from the trigger.
      setPlaceAbove(below < 288 && rect.top > below);
    }
    setActive(index);
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }

  function pick(index: number) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close();
  }

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  function matchTypeahead(key: string) {
    const state = typeahead.current;
    window.clearTimeout(state.timer);
    state.text += key.toLowerCase();
    state.timer = window.setTimeout(() => {
      state.text = "";
    }, 500);
    const start = open ? active : selectedIndex;
    const ordered = [...options.slice(start + 1), ...options.slice(0, start + 1)];
    const hit = ordered.find((o) => o.label.toLowerCase().startsWith(state.text));
    return hit ? options.indexOf(hit) : -1;
  }

  function onTriggerKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Enter":
      case " ":
        event.preventDefault();
        openList();
        return;
      case "Home":
        event.preventDefault();
        openList(0);
        return;
      case "End":
        event.preventDefault();
        openList(options.length - 1);
        return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const index = matchTypeahead(event.key);
      if (index >= 0) openList(index);
    }
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        return;
      case "Home":
      case "PageUp":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
      case "PageDown":
        event.preventDefault();
        setActive(options.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(active);
        return;
      case "Escape":
        event.preventDefault();
        close();
        return;
      case "Tab":
        close(false);
        return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const index = matchTypeahead(event.key);
      if (index >= 0) setActive(index);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKeyDown}
        /*
         * h-11 / text-base below `sm`: 44px is the touch-target floor, and
         * iOS Safari zooms the page when a focused control's text is under
         * 16px. Desktop gets the denser h-9 / text-sm of the search input.
         */
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-[var(--input)] bg-transparent pr-2.5 pl-3 text-left text-base shadow-xs transition-colors hover:bg-[var(--accent)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:h-9 sm:text-sm",
          open && "bg-[var(--accent)]/50",
        )}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-[var(--muted-foreground)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          aria-activedescendant={`${id}-option-${active}`}
          onKeyDown={onListKeyDown}
          className={cn(
            "absolute z-50 max-h-72 min-w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--popover)] p-1 text-[var(--popover-foreground)] shadow-lg focus:outline-none",
            align === "end" ? "right-0" : "left-0",
            placeAbove ? "bottom-full mb-1" : "top-full mt-1",
            listClassName,
          )}
        >
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              // Options never take focus: the list holds it and points at the
              // highlighted one through aria-activedescendant, and the list's
              // own onKeyDown covers the keyboard.
              // biome-ignore lint/a11y/useFocusableInteractive: see above
              // biome-ignore lint/a11y/useKeyWithClickEvents: see above
              <div
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                onPointerMove={() => setActive(index)}
                onClick={() => pick(index)}
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 text-base whitespace-nowrap select-none sm:h-8 sm:text-sm",
                  index === active && "bg-[var(--accent)] text-[var(--accent-foreground)]",
                  isSelected && "font-medium",
                )}
              >
                <span>{option.label}</span>
                <Check
                  aria-hidden
                  className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
