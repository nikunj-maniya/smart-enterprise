import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/** Styled native `<select>` with the standard chevron. Text renders muted while the value is
 *  empty (placeholder `<option value="">` showing), ink once a real option is chosen. */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, value, children, ...props }, ref) => (
    <div className="relative flex items-center">
      <select
        ref={ref}
        value={value}
        className={cn(
          'h-9 appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-8 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
          value ? 'text-ink-900' : 'text-ink-400',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 text-ink-400" />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
