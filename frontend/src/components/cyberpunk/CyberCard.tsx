'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface CyberCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'neon' | 'hologram';
  neonColor?: 'cyan' | 'magenta' | 'purple' | 'blue' | 'green';
  hoverEffect?: boolean;
  glowIntensity?: 'none' | 'low' | 'medium' | 'high';
}

const CyberCard = React.forwardRef<HTMLDivElement, CyberCardProps>(
  ({ className, variant = 'default', neonColor = 'cyan', hoverEffect = true, glowIntensity = 'low', children, ...props }, ref) => {
    const neonColorMap = {
      cyan: {
        border: 'border-brand-500/30',
        hoverBorder: 'hover:border-brand-500/60',
        glow: 'shadow-md shadow-brand-500/10',
        hoverGlow: 'hover:shadow-lg hover:shadow-brand-500/20',
        gradient: 'from-brand-500/10 to-transparent',
      },
      magenta: {
        border: 'border-pink-500/30',
        hoverBorder: 'hover:border-pink-400/60',
        glow: 'shadow-md shadow-pink-500/20',
        hoverGlow: 'hover:shadow-md shadow-pink-500/20',
        gradient: 'from-pink-500/10 to-transparent',
      },
      purple: {
        border: 'border-violet-500/30',
        hoverBorder: 'hover:border-violet-400/60',
        glow: 'shadow-md shadow-violet-500/20',
        hoverGlow: 'hover:shadow-md shadow-violet-500/20',
        gradient: 'from-violet-500/10 to-transparent',
      },
      blue: {
        border: 'border-blue-500/30',
        hoverBorder: 'hover:border-blue-400/60',
        glow: 'shadow-md shadow-blue-500/20',
        hoverGlow: 'hover:shadow-md shadow-blue-500/20',
        gradient: 'from-blue-500/10 to-transparent',
      },
      green: {
        border: 'border-green-500/30',
        hoverBorder: 'hover:border-green-400/60',
        glow: 'shadow-md shadow-green-500/20',
        hoverGlow: 'hover:shadow-md shadow-green-500/20',
        gradient: 'from-green-500/10 to-transparent',
      },
    };

    const variantStyles = {
      default: cn(
        'bg-card/90 backdrop-blur-sm border-2 rounded-xl',
        neonColorMap[neonColor].border,
        hoverEffect && neonColorMap[neonColor].hoverBorder,
        glowIntensity !== 'none' && neonColorMap[neonColor].glow,
        hoverEffect && neonColorMap[neonColor].hoverGlow
      ),
      glass: cn(
        'bg-card/40 backdrop-blur-xl border border-border/50 rounded-xl',
        'shadow-md',
        hoverEffect && 'hover:bg-muted/50 hover:border-border'
      ),
      neon: cn(
        'bg-background border-2 rounded-xl relative overflow-hidden',
        neonColorMap[neonColor].border,
        hoverEffect && neonColorMap[neonColor].hoverBorder,
        'shadow-lg shadow-brand-500/20',
        hoverEffect && 'hover:shadow-xl hover:shadow-brand-500/30'
      ),
      hologram: cn(
        'bg-gradient-to-br from-brand-500/5 via-violet-500/5 to-pink-500/5 backdrop-blur-xl',
        'border border-border/50 rounded-xl',
        'shadow-lg shadow-brand-500/10',
        hoverEffect && 'hover:from-brand-500/10 hover:via-violet-500/10 hover:to-pink-500/10'
      ),
    };

    return (
      <div
        ref={ref}
        className={cn(
          'transition-all duration-300',
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {/* Neon top line accent */}
        {variant === 'neon' && (
          <div className={cn(
            'absolute top-0 left-4 right-4 h-px',
            `bg-gradient-to-r ${neonColorMap[neonColor].gradient}`
          )} />
        )}
        {children}
      </div>
    );
  }
);

CyberCard.displayName = 'CyberCard';

// Card Header
const CyberCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col gap-1.5 p-5 pb-0', className)}
    {...props}
  />
));
CyberCardHeader.displayName = 'CyberCardHeader';

// Card Title
const CyberCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-lg font-bold tracking-wide text-foreground',
      className
    )}
    {...props}
  >
    {children}
  </h3>
));
CyberCardTitle.displayName = 'CyberCardTitle';

// Card Description
const CyberCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CyberCardDescription.displayName = 'CyberCardDescription';

// Card Content
const CyberCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5', className)} {...props} />
));
CyberCardContent.displayName = 'CyberCardContent';

// Card Footer
const CyberCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center gap-3 p-5 pt-0 border-t border-border/50 mt-4',
      className
    )}
    {...props}
  />
));
CyberCardFooter.displayName = 'CyberCardFooter';

// Stats Card Component
interface CyberStatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  change?: { value: number; type: 'increase' | 'decrease' };
  neonColor?: 'cyan' | 'magenta' | 'purple' | 'green';
  className?: string;
}

function CyberStatsCard({
  title,
  value,
  icon,
  change,
  neonColor = 'cyan',
  className,
}: CyberStatsCardProps) {
  const colorMap = {
    cyan: 'from-brand-400 to-brand-500',
    magenta: 'from-pink-400 to-pink-500',
    purple: 'from-violet-400 to-violet-500',
    green: 'from-green-400 to-green-500',
  };

  return (
    <CyberCard neonColor={neonColor} className={cn('p-4', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            {title}
          </p>
          <p className={cn(
            'text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent',
            colorMap[neonColor]
          )}>
            {value}
          </p>
          {change && (
            <p className={cn(
              'text-xs mt-1 font-medium',
              change.type === 'increase' ? 'text-green-400' : 'text-red-400'
            )}>
              {change.type === 'increase' ? '↑' : '↓'} {Math.abs(change.value)}%
            </p>
          )}
        </div>
        {icon && (
          <div className={cn(
            'p-2 rounded-lg bg-gradient-to-br',
            colorMap[neonColor],
            'shadow-md shadow-brand-500/30'
          )}>
            <div className="text-black">{icon}</div>
          </div>
        )}
      </div>
    </CyberCard>
  );
}

export {
  CyberCard,
  CyberCardHeader,
  CyberCardTitle,
  CyberCardDescription,
  CyberCardContent,
  CyberCardFooter,
  CyberStatsCard,
};
