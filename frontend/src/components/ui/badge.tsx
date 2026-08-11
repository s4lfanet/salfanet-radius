import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-lg border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-all duration-300 overflow-hidden",
  {
    variants: {
      variant: {
        default: [
          "bg-cyan-500/20 text-cyan-400 border-cyan-500/50",
          "shadow-[0_0_10px_rgba(0,255,255,0.2)]",
          "[a&]:hover:bg-cyan-500/30 [a&]:hover:shadow-[0_0_15px_rgba(0,255,255,0.3)]",
          "dark:neon-glow"
        ].join(" "),
        secondary: [
          "bg-white/5 text-foreground border-white/20",
          "[a&]:hover:bg-white/10"
        ].join(" "),
        destructive: [
          "bg-red-500/20 text-red-400 border-red-500/50",
          "shadow-[0_0_10px_rgba(255,51,102,0.2)]",
          "[a&]:hover:bg-red-500/30",
          "focus-visible:ring-red-500/20"
        ].join(" "),
        outline: [
          "bg-transparent text-foreground border-white/30",
          "[a&]:hover:bg-cyan-500/10 [a&]:hover:text-cyan-400 [a&]:hover:border-cyan-500/50"
        ].join(" "),
        success: [
          "bg-green-500/20 text-green-400 border-green-500/50",
          "shadow-[0_0_10px_rgba(0,255,136,0.2)]",
          "[a&]:hover:bg-green-500/30"
        ].join(" "),
        warning: [
          "bg-orange-500/20 text-orange-400 border-orange-500/50",
          "shadow-[0_0_10px_rgba(255,170,0,0.2)]",
          "[a&]:hover:bg-orange-500/30"
        ].join(" "),
        info: [
          "bg-blue-500/20 text-blue-400 border-blue-500/50",
          "shadow-[0_0_10px_rgba(59,130,246,0.2)]",
          "[a&]:hover:bg-blue-500/30"
        ].join(" "),
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
