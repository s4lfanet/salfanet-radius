'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * SimpleModal - A lightweight cyberpunk-themed modal component
 * Compatible with existing isOpen/onClose patterns used throughout admin pages
 */

interface SimpleModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
    showClose?: boolean;
    className?: string;
}

interface ModalHeaderProps {
    children: React.ReactNode;
    onClose?: () => void;
    className?: string;
}

interface ModalBodyProps {
    children: React.ReactNode;
    className?: string;
}

interface ModalFooterProps {
    children: React.ReactNode;
    className?: string;
}

const sizeClasses = {
    xs: 'max-w-xs',
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-[95vw] h-[90vh]',
};

export function SimpleModal({
    isOpen,
    onClose,
    children,
    size = 'md',
    showClose = true,
    className
}: SimpleModalProps) {
    // Stable ref for onClose — prevents useEffect churn when consumers pass inline arrows.
    // Without this, every parent re-render (e.g. notification polling every 30s,
    // or setFormData on each keystroke) creates a new onClose reference, causing the
    // Escape-key effect to teardown/setup on EVERY render. On mobile this rapid
    // event-listener churn interferes with virtual-keyboard focus → keyboard dismisses.
    const onCloseRef = React.useRef(onClose);
    React.useLayoutEffect(() => { onCloseRef.current = onClose; });

    // Track where pointer-down started so we only close on intentional backdrop clicks,
    // not when the user drags from inside the modal to outside (common on mobile).
    const pointerDownTarget = React.useRef<EventTarget | null>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);

    // Handle escape key — depends only on isOpen (not onClose)
    React.useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCloseRef.current();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    // Prevent body scroll when modal is open
    React.useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Backdrop click handler: close only if both pointer-down and pointer-up
    // happened outside the modal content. This prevents accidental closes from
    // drag interactions and is reliable across desktop and mobile browsers.
    const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
        pointerDownTarget.current = e.target;
    }, []);

    const handleClick = React.useCallback((e: React.MouseEvent) => {
        // Only close if both the mousedown/touchstart AND the click landed
        // outside the modal content panel
        if (
            contentRef.current &&
            !contentRef.current.contains(e.target as Node) &&
            !contentRef.current.contains(pointerDownTarget.current as Node)
        ) {
            onCloseRef.current();
        }
        pointerDownTarget.current = null;
    }, []);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            onPointerDown={handlePointerDown}
            onClick={handleClick}
        >
            {/* Backdrop with blur and subtle grid */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-200">
                {/* Scan line effect */}
                <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(139,92,246,0.02)_2px,rgba(139,92,246,0.02)_4px)] pointer-events-none" />
            </div>

            {/* Modal Container */}
            <div
                ref={contentRef}
                className={cn(
                    'relative w-full modal-content max-h-[90vh] flex flex-col',
                    sizeClasses[size],
                    // Animation
                    'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300',
                    // Base styles - theme aware
                    'bg-card dark:bg-muted rounded-xl overflow-hidden',
                    // Border with glow
                    'border-2 border-border dark:border-violet-500/40',
                    // Shadow glow effect
                    'shadow-xl dark:shadow-lg dark:shadow-violet-500/25',
                    className
                )}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
            >
                {/* Top neon line accent */}
                <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-primary dark:via-brand-500 to-transparent" />

                {/* Close button */}
                {showClose && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onCloseRef.current(); }}
                        className={cn(
                            'absolute right-3 top-3 z-10 rounded-lg p-2',
                            'text-muted-foreground hover:text-primary',
                            'bg-muted/50 hover:bg-muted dark:bg-card/50 dark:hover:bg-violet-500/20',
                            'border border-border dark:border-violet-500/30 hover:border-primary/50',
                            'transition-all duration-200',
                            'focus:outline-none focus:ring-2 focus:ring-primary/50'
                        )}
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}

                {children}
            </div>
        </div>,
        document.body
    );
}

export function ModalHeader({ children, onClose, className }: ModalHeaderProps) {
    return (
        <div className={cn(
            'px-5 py-4 border-b border-border dark:border-violet-500/30',
            'bg-slate-100 dark:bg-muted',
            className
        )}>
            {children}
        </div>
    );
}

export function ModalTitle({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <h2 className={cn(
            'text-lg font-bold modal-title-override',
            className
        )}>
            {children}
        </h2>
    );
}

export function ModalDescription({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <p className={cn('text-xs text-muted-foreground mt-1', className)}>
            {children}
        </p>
    );
}

export function ModalBody({ children, className }: ModalBodyProps) {
    return (
        <div className={cn(
            'px-5 py-4 max-h-[70vh] overflow-y-auto flex-1 min-h-0',
            // Custom scrollbar for cyberpunk theme
            'scrollbar-thin scrollbar-thumb-violet-500/40 scrollbar-track-transparent',
            className
        )}>
            {children}
        </div>
    );
}

export function ModalFooter({ children, className }: ModalFooterProps) {
    return (
        <div className={cn(
            'px-5 py-4 border-t border-border dark:border-violet-500/30',
            'bg-slate-50 dark:bg-muted',
            'flex items-center justify-end gap-3',
            className
        )}>
            {children}
        </div>
    );
}

// Cyberpunk styled form input for modals
export function ModalInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            className={cn(
                'w-full px-3 py-2 text-sm',
                'bg-background dark:bg-card border-2 border-input dark:border-violet-500/30 rounded-lg',
                'text-foreground placeholder-muted-foreground',
                'focus:border-primary dark:focus:border-brand-500 focus:ring-1 focus:ring-primary/50 dark:focus:ring-brand-500/50',
                'dark:focus:shadow-md dark:focus:shadow-brand-500/20',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all outline-none',
                className
            )}
            {...props}
        />
    );
}

export function ModalSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            className={cn(
                'w-full px-3 py-2 text-sm',
                'bg-background dark:bg-card border-2 border-input dark:border-violet-500/30 rounded-lg',
                'text-foreground',
                'focus:border-primary dark:focus:border-brand-500 focus:ring-1 focus:ring-primary/50 dark:focus:ring-brand-500/50',
                'transition-all outline-none appearance-none cursor-pointer',
                className
            )}
            {...props}
        >
            {children}
        </select>
    );
}

export function ModalTextarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            className={cn(
                'w-full px-3 py-2 text-sm',
                'bg-background dark:bg-card border-2 border-input dark:border-violet-500/30 rounded-lg',
                'text-foreground placeholder-muted-foreground',
                'focus:border-primary dark:focus:border-brand-500 focus:ring-1 focus:ring-primary/50 dark:focus:ring-brand-500/50',
                'dark:focus:shadow-md dark:focus:shadow-brand-500/20',
                'transition-all outline-none resize-none',
                className
            )}
            {...props}
        />
    );
}

export function ModalLabel({ children, className, required }: { children: React.ReactNode; className?: string; required?: boolean }) {
    return (
        <label className={cn('block text-xs font-medium text-foreground dark:text-muted-foreground mb-1.5', className)}>
            {children}
            {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
    );
}

// Button variants for modal
export function ModalButton({
    variant = 'primary',
    className,
    children,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'success' }) {
    const variants = {
        primary: cn(
            'bg-primary hover:bg-primary/90',
            'dark:bg-gradient-to-r dark:from-violet-500 dark:to-brand-500',
            'dark:hover:from-violet-600 dark:hover:to-brand-600',
            'text-primary-foreground font-bold',
            'dark:shadow-[0_0_20px_rgba(139,92,246,0.3)]',
            'dark:hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]'
        ),
        secondary: cn(
            'bg-secondary border-2 border-border dark:border-violet-500/30',
            'hover:bg-secondary/80 dark:hover:border-brand-500/50 dark:hover:bg-violet-500/10',
            'text-secondary-foreground'
        ),
        danger: cn(
            'bg-destructive hover:bg-destructive/90',
            'dark:bg-gradient-to-r dark:from-red-500 dark:to-pink-500',
            'dark:hover:from-red-600 dark:hover:to-pink-600',
            'text-destructive-foreground font-bold',
            'dark:shadow-md dark:shadow-red-500/30'
        ),
        success: cn(
            'bg-green-600 hover:bg-green-700 text-white',
            'dark:bg-gradient-to-r dark:from-green-500 dark:to-brand-500',
            'dark:hover:from-green-600 dark:hover:to-brand-600',
            'dark:text-black font-bold',
            'dark:shadow-md dark:shadow-green-500/30'
        ),
    };

    return (
        <button
            className={cn(
                'px-4 py-2 text-sm rounded-lg',
                'transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                variants[variant],
                className
            )}
            {...props}
        >
            {children}
        </button>
    );
}
