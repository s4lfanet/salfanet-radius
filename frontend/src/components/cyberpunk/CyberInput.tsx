'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface CyberInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'neon' | 'glass';
  neonColor?: 'cyan' | 'magenta' | 'purple';
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const CyberInput = React.forwardRef<HTMLInputElement, CyberInputProps>(
  ({ 
    className, 
    type = 'text', 
    variant = 'default', 
    neonColor = 'cyan',
    label,
    error,
    icon,
    iconPosition = 'left',
    ...props 
  }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);

    const colorMap = {
      cyan: {
        border: 'border-cyan-500/30',
        focusBorder: 'focus:border-cyan-400',
        focusRing: 'focus:ring-cyan-400/30',
        focusGlow: 'focus:shadow-[0_0_20px_rgba(0,255,255,0.2)]',
        labelColor: 'text-cyan-400',
      },
      magenta: {
        border: 'border-pink-500/30',
        focusBorder: 'focus:border-pink-400',
        focusRing: 'focus:ring-pink-400/30',
        focusGlow: 'focus:shadow-[0_0_20px_rgba(255,0,255,0.2)]',
        labelColor: 'text-pink-400',
      },
      purple: {
        border: 'border-purple-500/30',
        focusBorder: 'focus:border-purple-400',
        focusRing: 'focus:ring-purple-400/30',
        focusGlow: 'focus:shadow-[0_0_20px_rgba(147,51,234,0.2)]',
        labelColor: 'text-purple-400',
      },
    };

    const variantStyles = {
      default: cn(
        'bg-background/50 backdrop-blur-sm',
        colorMap[neonColor].border,
        colorMap[neonColor].focusBorder,
        colorMap[neonColor].focusRing,
        colorMap[neonColor].focusGlow
      ),
      neon: cn(
        'bg-black/50 backdrop-blur-sm',
        'border-2',
        colorMap[neonColor].border,
        colorMap[neonColor].focusBorder,
        'focus:shadow-[0_0_30px_rgba(0,255,255,0.3),inset_0_0_20px_rgba(0,255,255,0.05)]'
      ),
      glass: cn(
        'bg-white/5 backdrop-blur-xl',
        'border border-white/10',
        'focus:border-white/30',
        'focus:bg-white/10'
      ),
    };

    return (
      <div className="w-full">
        {label && (
          <label className={cn(
            'block text-xs font-bold uppercase tracking-wider mb-2 transition-colors',
            isFocused ? colorMap[neonColor].labelColor : 'text-muted-foreground'
          )}>
            {label}
          </label>
        )}
        <div className="relative">
          {icon && iconPosition === 'left' && (
            <div className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 transition-colors',
              isFocused ? colorMap[neonColor].labelColor : 'text-muted-foreground'
            )}>
              {icon}
            </div>
          )}
          <input
            type={type}
            ref={ref}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              // Base styles
              'w-full h-11 px-4 rounded-lg text-sm text-foreground',
              'placeholder:text-muted-foreground/50',
              'border-2 outline-none',
              'transition-all duration-300',
              // Disabled state
              'disabled:opacity-50 disabled:cursor-not-allowed',
              // Error state
              error && 'border-red-500/50 focus:border-red-400 focus:ring-red-400/30',
              // Icon padding
              icon && iconPosition === 'left' && 'pl-10',
              icon && iconPosition === 'right' && 'pr-10',
              // Variant styles
              !error && variantStyles[variant],
              className
            )}
            {...props}
          />
          {icon && iconPosition === 'right' && (
            <div className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 transition-colors',
              isFocused ? colorMap[neonColor].labelColor : 'text-muted-foreground'
            )}>
              {icon}
            </div>
          )}
          {/* Animated focus line */}
          <div className={cn(
            'absolute bottom-0 left-1/2 h-0.5 bg-gradient-to-r transition-all duration-300',
            isFocused ? 'w-full -translate-x-1/2' : 'w-0 -translate-x-1/2',
            neonColor === 'cyan' && 'from-cyan-400 via-cyan-500 to-cyan-400',
            neonColor === 'magenta' && 'from-pink-400 via-pink-500 to-pink-400',
            neonColor === 'purple' && 'from-purple-400 via-purple-500 to-purple-400'
          )} />
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-red-400" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

CyberInput.displayName = 'CyberInput';

// Textarea variant
interface CyberTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: 'default' | 'neon' | 'glass';
  neonColor?: 'cyan' | 'magenta' | 'purple';
  label?: string;
  error?: string;
}

const CyberTextarea = React.forwardRef<HTMLTextAreaElement, CyberTextareaProps>(
  ({ className, variant = 'default', neonColor = 'cyan', label, error, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);

    const colorMap = {
      cyan: {
        border: 'border-cyan-500/30',
        focusBorder: 'focus:border-cyan-400',
        focusRing: 'focus:ring-cyan-400/30',
        labelColor: 'text-cyan-400',
      },
      magenta: {
        border: 'border-pink-500/30',
        focusBorder: 'focus:border-pink-400',
        focusRing: 'focus:ring-pink-400/30',
        labelColor: 'text-pink-400',
      },
      purple: {
        border: 'border-purple-500/30',
        focusBorder: 'focus:border-purple-400',
        focusRing: 'focus:ring-purple-400/30',
        labelColor: 'text-purple-400',
      },
    };

    return (
      <div className="w-full">
        {label && (
          <label className={cn(
            'block text-xs font-bold uppercase tracking-wider mb-2 transition-colors',
            isFocused ? colorMap[neonColor].labelColor : 'text-muted-foreground'
          )}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            'w-full min-h-[100px] px-4 py-3 rounded-lg text-sm text-foreground',
            'placeholder:text-muted-foreground/50',
            'border-2 outline-none',
            'bg-background/50 backdrop-blur-sm',
            'transition-all duration-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'resize-none',
            colorMap[neonColor].border,
            colorMap[neonColor].focusBorder,
            colorMap[neonColor].focusRing,
            error && 'border-red-500/50 focus:border-red-400',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

CyberTextarea.displayName = 'CyberTextarea';

// Select variant
interface CyberSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  variant?: 'default' | 'neon' | 'glass';
  neonColor?: 'cyan' | 'magenta' | 'purple';
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

const CyberSelect = React.forwardRef<HTMLSelectElement, CyberSelectProps>(
  ({ className, variant = 'default', neonColor = 'cyan', label, error, options, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);

    const colorMap = {
      cyan: {
        border: 'border-cyan-500/30',
        focusBorder: 'focus:border-cyan-400',
        labelColor: 'text-cyan-400',
      },
      magenta: {
        border: 'border-pink-500/30',
        focusBorder: 'focus:border-pink-400',
        labelColor: 'text-pink-400',
      },
      purple: {
        border: 'border-purple-500/30',
        focusBorder: 'focus:border-purple-400',
        labelColor: 'text-purple-400',
      },
    };

    return (
      <div className="w-full">
        {label && (
          <label className={cn(
            'block text-xs font-bold uppercase tracking-wider mb-2 transition-colors',
            isFocused ? colorMap[neonColor].labelColor : 'text-muted-foreground'
          )}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            'w-full h-11 px-4 rounded-lg text-sm text-foreground',
            'border-2 outline-none',
            'bg-background/50 backdrop-blur-sm',
            'transition-all duration-300',
            'cursor-pointer appearance-none',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            colorMap[neonColor].border,
            colorMap[neonColor].focusBorder,
            error && 'border-red-500/50',
            className
          )}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2306b6d4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundSize: '16px',
          }}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-background">
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1.5 text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

CyberSelect.displayName = 'CyberSelect';

export { CyberInput, CyberTextarea, CyberSelect };
