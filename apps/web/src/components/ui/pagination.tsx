import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** "Showing X–Y of Z" + Prev/Next, per the master-list convention. Renders nothing while
 *  everything fits on one page. */
export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: PaginationBarProps) {
  if (total <= pageSize) return null;
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className={cn('mt-4 flex items-center justify-between', className)}
    >
      <span className="text-[12.5px] text-ink-400">
        Showing {rangeStart}–{rangeEnd} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page * pageSize >= total}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
