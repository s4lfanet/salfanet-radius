"use client"

import * as React from "react"

import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface ToggleRowProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
  className?: string
}

/** Label on the left, switch on the right, tappable across the whole row. */
function ToggleRow({ checked, onCheckedChange, label, description, disabled, className }: ToggleRowProps) {
  const id = React.useId()
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        checked ? "border-brand-200 bg-brand-50/60 dark:border-brand-500/30 dark:bg-brand-500/10" : "border-border bg-card",
        disabled && "opacity-60",
        className
      )}
    >
      <label htmlFor={id} className={cn("min-w-0 flex-1", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

export { ToggleRow }
