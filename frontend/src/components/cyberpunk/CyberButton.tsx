'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cyberButtonVariants = cva(
  // Base styles - clean, modern
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold tracking-wide transition duration-200 disabled:pointer-events-none disabled:opacity-50 overflow-hidden',
  {
    variants: {
      variant: {
        // Primary - Blue
        default: [
          'bg-primary text-primary-foreground',
          'border border-primary',
          'shadow-sm',
          'hover:bg-primary/90 hover:border-primary/90 hover:shadow-md hover:shadow-primary/20',
          'active:scale-[0.98]',
        ].join(' '),

        // Cyan → mapped to Blue-400
        cyan: [
          'bg-primary text-primary-foreground',
          'border border-primary',
          'shadow-sm',
          'hover:bg-primary/90 hover:border-primary/90 hover:shadow-md hover:shadow-primary/20',
          'active:scale-[0.98]',
        ].join(' '),

        // Magenta → Violet
        magenta: [
          'bg-primary text-primary-foreground',
          'border border-primary',
          'shadow-sm',
          'hover:bg-primary/90 hover:border-primary/90 hover:shadow-md hover:shadow-primary/20',
          'active:scale-[0.98]',
        ].join(' '),

        // Purple → Indigo
        purple: [
          'bg-primary text-primary-foreground',
          'border border-primary',
          'shadow-sm',
          'hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20',
          'active:scale-[0.98]',
        ].join(' '),

        // Destructive - Red
        destructive: [
          'bg-destructive text-destructive-foreground',
          'border border-destructive',
          'shadow-sm',
          'hover:bg-destructive/90 hover:border-destructive/90 hover:shadow-md hover:shadow-destructive/20',
          'active:scale-[0.98]',
        ].join(' '),

        // Success - Emerald
        success: [
          'bg-success text-success-foreground',
          'border border-success',
          'shadow-sm',
          'hover:bg-success/90 hover:border-success/90 hover:shadow-md hover:shadow-success/20',
          'active:scale-[0.98]',
        ].join(' '),

        // Warning - Amber
        warning: [
          'bg-warning text-warning-foreground',
          'border border-warning',
          'shadow-sm',
          'hover:bg-warning/90 hover:border-warning/90 hover:shadow-md hover:shadow-warning/20',
          'active:scale-[0.98]',
        ].join(' '),

        // Outline - Blue border
        outline: [
          'bg-transparent text-blue-600 dark:text-blue-400',
          'border border-blue-300 dark:border-blue-700',
          'hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-400 dark:hover:border-blue-500',
          'active:scale-[0.98]',
        ].join(' '),

        // Ghost - minimal
        ghost: [
          'bg-transparent text-muted-foreground',
          'border border-transparent',
          'hover:bg-accent hover:text-slate-900 dark:hover:text-slate-100',
          'active:scale-[0.98]',
        ].join(' '),

        // Link
        link: [
          'bg-transparent text-blue-600 dark:text-blue-400 underline-offset-4',
          'border-none shadow-none',
          'hover:underline hover:text-blue-700 dark:hover:text-blue-300',
        ].join(' '),

        // Glass - subtle overlay
        glass: [
          'bg-muted/50 dark:bg-card/40 text-slate-800 dark:text-slate-200',
          'border border-border',
          'shadow-sm',
          'hover:bg-blue-50/80 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-700',
          'active:scale-[0.98]',
        ].join(' '),
      },
      size: {
        default: 'h-10 px-6 py-2.5 text-sm rounded-xl',
        sm: 'h-8 px-4 text-xs rounded-lg',
        lg: 'h-12 px-8 text-sm rounded-xl',
        xl: 'h-14 px-10 text-base rounded-xl',
        icon: 'h-10 w-10 rounded-xl',
        'icon-sm': 'h-8 w-8 rounded-lg',
        'icon-lg': 'h-12 w-12 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface CyberButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof cyberButtonVariants> {
  asChild?: boolean;
  loading?: boolean;
  glowPulse?: boolean;
}

const CyberButton = React.forwardRef<HTMLButtonElement, CyberButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, glowPulse = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          cyberButtonVariants({ variant, size }),
          glowPulse && 'animate-neon-pulse',
          className
        )}
        {...props}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-inherit">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <span className={cn('flex items-center gap-2', loading && 'invisible')}>
          {children}
        </span>
      </Comp>
    );
  }
);

CyberButton.displayName = 'CyberButton';

export { CyberButton, cyberButtonVariants };
