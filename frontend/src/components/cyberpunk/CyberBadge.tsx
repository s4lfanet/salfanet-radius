'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cyberBadgeVariants = cva(
  // Base styles
  'inline-flex items-center justify-center font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-300',
  {
    variants: {
      variant: {
        // Neon cyan
        default: [
          'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50',
          'shadow-[0_0_10px_rgba(0,255,255,0.2)]',
        ].join(' '),
        
        // Neon magenta
        magenta: [
          'bg-pink-500/20 text-pink-400 border border-pink-500/50',
          'shadow-[0_0_10px_rgba(255,0,255,0.2)]',
        ].join(' '),
        
        // Neon purple
        purple: [
          'bg-purple-500/20 text-purple-400 border border-purple-500/50',
          'shadow-[0_0_10px_rgba(147,51,234,0.2)]',
        ].join(' '),
        
        // Neon green (success)
        success: [
          'bg-green-500/20 text-green-400 border border-green-500/50',
          'shadow-[0_0_10px_rgba(0,255,0,0.2)]',
        ].join(' '),
        
        // Neon red (destructive)
        destructive: [
          'bg-red-500/20 text-red-400 border border-red-500/50',
          'shadow-[0_0_10px_rgba(255,0,0,0.2)]',
        ].join(' '),
        
        // Neon orange (warning)
        warning: [
          'bg-orange-500/20 text-orange-400 border border-orange-500/50',
          'shadow-[0_0_10px_rgba(255,165,0,0.2)]',
        ].join(' '),
        
        // Neon blue (info)
        info: [
          'bg-blue-500/20 text-blue-400 border border-blue-500/50',
          'shadow-[0_0_10px_rgba(59,130,246,0.2)]',
        ].join(' '),
        
        // Solid variants
        'solid-cyan': [
          'bg-cyan-500 text-black border border-cyan-400',
          'shadow-[0_0_20px_rgba(0,255,255,0.4)]',
        ].join(' '),
        
        'solid-magenta': [
          'bg-pink-500 text-white border border-pink-400',
          'shadow-[0_0_20px_rgba(255,0,255,0.4)]',
        ].join(' '),
        
        'solid-success': [
          'bg-green-500 text-black border border-green-400',
          'shadow-[0_0_20px_rgba(0,255,0,0.4)]',
        ].join(' '),
        
        'solid-destructive': [
          'bg-red-500 text-white border border-red-400',
          'shadow-[0_0_20px_rgba(255,0,0,0.4)]',
        ].join(' '),
        
        // Outline
        outline: [
          'bg-transparent text-foreground border border-white/30',
          'hover:border-cyan-400/50 hover:text-cyan-400',
        ].join(' '),
        
        // Glass
        glass: [
          'bg-white/5 backdrop-blur-sm text-foreground border border-white/10',
        ].join(' '),
      },
      size: {
        sm: 'px-2 py-0.5 text-[9px] rounded-md',
        default: 'px-2.5 py-1 text-[10px] rounded-lg',
        lg: 'px-3 py-1.5 text-xs rounded-lg',
      },
      animated: {
        true: 'animate-neon-pulse',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      animated: false,
    },
  }
);

interface CyberBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof cyberBadgeVariants> {
  icon?: React.ReactNode;
  dot?: boolean;
  pulse?: boolean;
}

const CyberBadge = React.forwardRef<HTMLSpanElement, CyberBadgeProps>(
  ({ className, variant, size, animated, icon, dot, pulse, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(cyberBadgeVariants({ variant, size, animated }), className)}
        {...props}
      >
        {dot && (
          <span className={cn(
            'w-1.5 h-1.5 rounded-full mr-1.5',
            'bg-current',
            pulse && 'animate-pulse'
          )} />
        )}
        {icon && <span className="mr-1">{icon}</span>}
        {children}
      </span>
    );
  }
);

CyberBadge.displayName = 'CyberBadge';

// Status badge with specific status styling
interface CyberStatusBadgeProps {
  status: 'online' | 'offline' | 'pending' | 'active' | 'inactive' | 'error' | 'warning' | 'success';
  label?: string;
  size?: 'sm' | 'default' | 'lg';
  showDot?: boolean;
  className?: string;
}

function CyberStatusBadge({
  status,
  label,
  size = 'default',
  showDot = true,
  className,
}: CyberStatusBadgeProps) {
  const statusConfig = {
    online: { variant: 'success' as const, label: 'Online' },
    offline: { variant: 'destructive' as const, label: 'Offline' },
    pending: { variant: 'warning' as const, label: 'Pending' },
    active: { variant: 'default' as const, label: 'Active' },
    inactive: { variant: 'glass' as const, label: 'Inactive' },
    error: { variant: 'destructive' as const, label: 'Error' },
    warning: { variant: 'warning' as const, label: 'Warning' },
    success: { variant: 'success' as const, label: 'Success' },
  };

  const config = statusConfig[status];

  return (
    <CyberBadge
      variant={config.variant}
      size={size}
      dot={showDot}
      pulse={status === 'online' || status === 'pending'}
      className={className}
    >
      {label || config.label}
    </CyberBadge>
  );
}

// Counter badge (for notifications, etc.)
interface CyberCounterBadgeProps {
  count: number;
  maxCount?: number;
  variant?: 'default' | 'magenta' | 'destructive';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

function CyberCounterBadge({
  count,
  maxCount = 99,
  variant = 'default',
  size = 'default',
  className,
}: CyberCounterBadgeProps) {
  const displayCount = count > maxCount ? `${maxCount}+` : count.toString();

  if (count <= 0) return null;

  return (
    <CyberBadge
      variant={variant}
      size={size}
      className={cn('min-w-[20px] text-center', className)}
    >
      {displayCount}
    </CyberBadge>
  );
}

export { CyberBadge, cyberBadgeVariants, CyberStatusBadge, CyberCounterBadge };
