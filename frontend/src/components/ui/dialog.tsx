"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4 w-full h-full">
        <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "relative pointer-events-auto",
            "w-full max-w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto",
            "grid gap-0 p-0 rounded-xl flex-col flex",
            "bg-card",
            "border-2 border-cyan-500/20",
            "shadow-xl",
            // Animation
            "duration-300",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4",
              "[&>*:not([data-slot=dialog-header]):not([data-slot=dialog-footer]):not([data-slot=dialog-close]):not(.absolute)]:px-4 sm:[&>*:not([data-slot=dialog-header]):not([data-slot=dialog-footer]):not([data-slot=dialog-close]):not(.absolute)]:px-6",
              "[&>*:not([data-slot=dialog-header]):not([data-slot=dialog-footer]):not([data-slot=dialog-close]):not(.absolute)]:py-3 sm:[&>*:not([data-slot=dialog-header]):not([data-slot=dialog-footer]):not([data-slot=dialog-close]):not(.absolute)]:py-4",
          className
        )}
        {...props}
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-primary dark:via-cyan-400 to-transparent" />
        
        {children}
        
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              "absolute top-4 right-4 rounded-lg p-2",
              "text-muted-foreground hover:text-primary",
              "bg-muted/50 hover:bg-muted dark:hover:bg-cyan-500/20",
              "border border-border hover:border-primary/50 dark:hover:border-cyan-400/50",
              "ring-offset-background transition-all duration-200",
              "focus:ring-2 focus:ring-primary/50 dark:focus:ring-cyan-400/50 focus:outline-hidden",
              "disabled:pointer-events-none",
              "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            )}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
        </div>
      </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2 text-center sm:text-left p-4 sm:p-6 pb-3 sm:pb-4",
        "border-b border-border",
        "bg-slate-100 dark:bg-card",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end p-4 sm:p-6 pt-3 sm:pt-4 sticky bottom-0 z-10",
        "border-t border-border",
        "bg-slate-50 dark:bg-card",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-lg font-bold modal-title-override",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-xs text-muted-foreground mt-1", className)}
      {...props}
    />
  )
}

// Dialog Body - new component for content area
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("p-4 sm:p-6", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogBody,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}




