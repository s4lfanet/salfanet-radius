import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground/50 selection:bg-cyan-400/20 selection:text-foreground",
        "h-10 sm:h-11 w-full min-w-0 rounded-xl border-2 border-cyan-500/30 bg-background/50 px-3.5 sm:px-4 py-2 text-base sm:text-sm",
        "shadow-[0_0_10px_rgba(0,255,255,0.05)] backdrop-blur-sm",
        "transition-all duration-300 outline-none",
        "hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(0,255,255,0.1)]",
        "focus-visible:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/30",
        "focus-visible:shadow-[0_0_20px_rgba(0,255,255,0.2)]",
        "dark:focus-visible:neon-glow",
        "file:inline-flex file:h-8 file:border-0 file:bg-cyan-500/20 file:rounded-lg file:px-3 file:text-sm file:font-medium file:mr-3 file:text-cyan-400",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/40",
        "aria-invalid:border-red-500/50 aria-invalid:ring-2 aria-invalid:ring-red-500/15 aria-invalid:shadow-[0_0_10px_rgba(255,51,102,0.1)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
