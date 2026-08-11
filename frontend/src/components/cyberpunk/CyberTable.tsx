'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// Table Container
interface CyberTableProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'neon' | 'glass';
}

const CyberTable = React.forwardRef<HTMLDivElement, CyberTableProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variantStyles = {
      default: cn(
        'border-2 border-cyan-500/20 rounded-xl overflow-hidden',
        'shadow-[0_0_20px_rgba(0,255,255,0.1)]',
        'bg-background/50 backdrop-blur-sm'
      ),
      neon: cn(
        'border-2 border-cyan-500/30 rounded-xl overflow-hidden',
        'shadow-[0_0_30px_rgba(0,255,255,0.15),inset_0_0_30px_rgba(0,255,255,0.02)]',
        'bg-black/40 backdrop-blur-xl'
      ),
      glass: cn(
        'border border-white/10 rounded-xl overflow-hidden',
        'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
        'bg-white/5 backdrop-blur-xl'
      ),
    };

    return (
      <div
        ref={ref}
        className={cn(
          'relative w-full overflow-x-auto',
          variantStyles[variant],
          className
        )}
        {...props}
      >
        <table className="w-full caption-bottom text-sm">{children}</table>
      </div>
    );
  }
);
CyberTable.displayName = 'CyberTable';

// Table Header
const CyberTableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      'bg-gradient-to-r from-cyan-500/10 via-purple-500/5 to-pink-500/10',
      'border-b-2 border-cyan-500/20',
      '[&_tr]:border-b-0',
      className
    )}
    {...props}
  />
));
CyberTableHeader.displayName = 'CyberTableHeader';

// Table Body
const CyberTableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
));
CyberTableBody.displayName = 'CyberTableBody';

// Table Footer
const CyberTableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t-2 border-cyan-500/20 bg-cyan-500/5',
      'font-medium',
      className
    )}
    {...props}
  />
));
CyberTableFooter.displayName = 'CyberTableFooter';

// Table Row
interface CyberTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

const CyberTableRow = React.forwardRef<HTMLTableRowElement, CyberTableRowProps>(
  ({ className, selected, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-white/5 transition-all duration-300',
        'hover:bg-gradient-to-r hover:from-cyan-500/5 hover:via-transparent hover:to-pink-500/5',
        'hover:shadow-[inset_0_0_30px_rgba(0,255,255,0.03)]',
        selected && [
          'bg-cyan-500/10 border-cyan-500/30',
          'shadow-[inset_0_0_20px_rgba(0,255,255,0.05)]',
        ],
        className
      )}
      {...props}
    />
  )
);
CyberTableRow.displayName = 'CyberTableRow';

// Table Head Cell
const CyberTableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-12 px-4 text-left align-middle',
      'font-bold text-xs uppercase tracking-wider',
      'text-cyan-400 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]',
      'whitespace-nowrap',
      '[&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
));
CyberTableHead.displayName = 'CyberTableHead';

// Table Cell
const CyberTableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-4 py-3 align-middle text-foreground',
      '[&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
));
CyberTableCell.displayName = 'CyberTableCell';

// Table Caption
const CyberTableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn(
      'mt-4 text-sm text-muted-foreground',
      className
    )}
    {...props}
  />
));
CyberTableCaption.displayName = 'CyberTableCaption';

// Empty State Component
interface CyberTableEmptyProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

function CyberTableEmpty({
  icon,
  title = 'No data found',
  description = 'There are no records to display.',
  action,
}: CyberTableEmptyProps) {
  return (
    <CyberTableRow>
      <CyberTableCell colSpan={100} className="h-48">
        <div className="flex flex-col items-center justify-center text-center">
          {icon && (
            <div className="mb-4 p-4 rounded-full bg-cyan-500/10 text-cyan-400">
              {icon}
            </div>
          )}
          <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
          {action}
        </div>
      </CyberTableCell>
    </CyberTableRow>
  );
}

// Skeleton Row for Loading
function CyberTableSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, rowIndex) => (
        <CyberTableRow key={rowIndex} className="animate-pulse">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <CyberTableCell key={colIndex}>
              <div className="h-4 bg-cyan-500/10 rounded w-full max-w-[150px]" />
            </CyberTableCell>
          ))}
        </CyberTableRow>
      ))}
    </>
  );
}

export {
  CyberTable,
  CyberTableHeader,
  CyberTableBody,
  CyberTableFooter,
  CyberTableRow,
  CyberTableHead,
  CyberTableCell,
  CyberTableCaption,
  CyberTableEmpty,
  CyberTableSkeleton,
};
