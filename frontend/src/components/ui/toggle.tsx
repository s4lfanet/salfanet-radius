"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Toggle — shared on/off switch component.
 *
 * Consistent sizing across the app. The visual track is h-6 w-11 (44×24px)
 * with an enlarged invisible hit area (-m-2 p-2 = 60×40px effective tap
 * target) for mobile usability.
 *
 * Usage:
 *   <Toggle checked={enabled} onChange={setEnabled} disabled={loading} />
 */
export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  /** Accessible label for screen readers */
  "aria-label"?: string
}

export function Toggle({ checked, onChange, disabled, className, ...props }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onChange(!checked)
      }}
      className={cn(
        // Enlarge hit area without affecting layout (visual stays h-6 w-11)
        "relative -m-2 inline-flex shrink-0 items-center rounded-full p-2 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span
        data-slot="toggle-track"
        className={cn(
          "inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
          checked
            ? "bg-primary"
            : "bg-muted-foreground/30 dark:bg-muted"
        )}
      >
        <span
          data-slot="toggle-thumb"
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  )
}
