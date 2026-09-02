'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, limit, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const pageNumbers: number[] = [];
  const maxButtons = 5;
  let start = Math.max(1, page - 2);
  let end = Math.min(totalPages, start + maxButtons - 1);
  if (end - start + 1 < maxButtons) {
    start = Math.max(1, end - maxButtons + 1);
  }
  for (let i = start; i <= end; i++) {
    pageNumbers.push(i);
  }

  const btnBase = 'p-1.5 text-xs border border-border rounded-lg disabled:opacity-30 hover:bg-muted transition text-muted-foreground';
  const numBtnBase = 'px-3 py-1.5 text-xs border rounded-lg transition';

  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <p className="text-xs text-muted-foreground">
        {from}–{to} / {total.toLocaleString('id-ID')}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(1)} disabled={page === 1} className={btnBase} title="First">
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className={btnBase} title="Prev">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pageNumbers.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`${numBtnBase} ${
              p === page
                ? 'bg-primary text-primary-foreground border-primary font-semibold'
                : 'border-border hover:bg-muted text-muted-foreground'
            }`}
          >
            {p}
          </button>
        ))}
        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className={btnBase} title="Next">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} className={btnBase} title="Last">
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
