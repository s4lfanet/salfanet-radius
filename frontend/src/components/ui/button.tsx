import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] touch-action-manipulation overflow-hidden",
  {
    variants: {
      variant: {
        default: [
          "bg-gradient-to-r from-cyan-500 to-cyan-400 text-black",
          "border-2 border-cyan-400",
          "shadow-[0_0_20px_rgba(0,255,255,0.3)]",
          "hover:shadow-[0_0_30px_rgba(0,255,255,0.5)] hover:border-cyan-300",
          "dark:neon-glow"
        ].join(" "),
        destructive: [
          "bg-gradient-to-r from-red-500 to-red-400 text-white",
          "border-2 border-red-400",
          "shadow-[0_0_20px_rgba(255,51,102,0.3)]",
          "hover:shadow-[0_0_30px_rgba(255,51,102,0.5)]"
        ].join(" "),
        outline: [
          "bg-transparent text-cyan-400",
          "border-2 border-cyan-500/50",
          "shadow-[0_0_10px_rgba(0,255,255,0.1)]",
          "hover:bg-cyan-400/10 hover:border-cyan-400",
          "hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]",
          "dark:neon-border"
        ].join(" "),
        secondary: [
          "bg-white/5 text-foreground",
          "border-2 border-white/10",
          "hover:bg-white/10 hover:border-cyan-400/30"
        ].join(" "),
        ghost: [
          "bg-transparent text-foreground",
          "border-2 border-transparent",
          "hover:bg-white/5 hover:text-cyan-400 hover:border-cyan-400/30"
        ].join(" "),
        link: [
          "text-cyan-400 underline-offset-4",
          "hover:underline hover:text-cyan-300",
          "drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]",
          "dark:neon-text"
        ].join(" "),
        success: [
          "bg-gradient-to-r from-green-500 to-green-400 text-black",
          "border-2 border-green-400",
          "shadow-[0_0_20px_rgba(0,255,136,0.3)]",
          "hover:shadow-[0_0_30px_rgba(0,255,136,0.5)]"
        ].join(" "),
        warning: [
          "bg-gradient-to-r from-orange-500 to-orange-400 text-black",
          "border-2 border-orange-400",
          "shadow-[0_0_20px_rgba(255,170,0,0.3)]",
          "hover:shadow-[0_0_30px_rgba(255,170,0,0.5)]"
        ].join(" "),
      },
      size: {
        default: "h-10 px-6 py-2.5 has-[>svg]:px-4",
        sm: "h-8 rounded-lg gap-1.5 px-4 text-xs has-[>svg]:px-3",
        lg: "h-12 rounded-xl px-8 text-sm has-[>svg]:px-6",
        xl: "h-14 rounded-2xl px-10 text-base has-[>svg]:px-8",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-12 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
