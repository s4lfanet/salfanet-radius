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
        border: 'border-cyan-500/30',
        hoverBorder: 'hover:border-cyan-400/60',
        glow: 'shadow-[0_0_20px_rgba(0,255,255,0.1)]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(0,255,255,0.2)]',
        gradient: 'from-cyan-500/10 to-transparent',
      },
      magenta: {
        border: 'border-pink-500/30',
        hoverBorder: 'hover:border-pink-400/60',
        glow: 'shadow-[0_0_20px_rgba(255,0,255,0.1)]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(255,0,255,0.2)]',
        gradient: 'from-pink-500/10 to-transparent',
      },
      purple: {
        border: 'border-purple-500/30',
        hoverBorder: 'hover:border-purple-400/60',
        glow: 'shadow-[0_0_20px_rgba(147,51,234,0.1)]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(147,51,234,0.2)]',
        gradient: 'from-purple-500/10 to-transparent',
      },
      blue: {
        border: 'border-blue-500/30',
        hoverBorder: 'hover:border-blue-400/60',
        glow: 'shadow-[0_0_20px_rgba(59,130,246,0.1)]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(59,130,246,0.2)]',
        gradient: 'from-blue-500/10 to-transparent',
      },
      green: {
        border: 'border-green-500/30',
        hoverBorder: 'hover:border-green-400/60',
        glow: 'shadow-[0_0_20px_rgba(0,255,0,0.1)]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(0,255,0,0.2)]',
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
        'bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl',
        'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
        hoverEffect && 'hover:bg-white/10 hover:border-white/20'
      ),
      neon: cn(
        'bg-background border-2 rounded-xl relative overflow-hidden',
        neonColorMap[neonColor].border,
        hoverEffect && neonColorMap[neonColor].hoverBorder,
        'shadow-[0_0_30px_rgba(0,255,255,0.2)]',
        hoverEffect && 'hover:shadow-[0_0_50px_rgba(0,255,255,0.3)]'
      ),
      hologram: cn(
        'bg-gradient-to-br from-cyan-500/5 via-purple-500/5 to-pink-500/5 backdrop-blur-xl',
        'border border-white/10 rounded-xl',
        'shadow-[0_0_40px_rgba(0,255,255,0.1),0_0_80px_rgba(255,0,255,0.05)]',
        hoverEffect && 'hover:from-cyan-500/10 hover:via-purple-500/10 hover:to-pink-500/10'
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
      'drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]',
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
      'flex items-center gap-3 p-5 pt-0 border-t border-white/10 mt-4',
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
    cyan: 'from-cyan-400 to-cyan-500',
    magenta: 'from-pink-400 to-pink-500',
    purple: 'from-purple-400 to-purple-500',
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
            'shadow-[0_0_20px_rgba(0,255,255,0.3)]'
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
