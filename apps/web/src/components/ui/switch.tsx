import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** 44×24 pill toggle (`role="switch"`). Label it via `aria-label` or an adjacent `<label>`. */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, ...props }, ref) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      ref={ref}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-6 w-11 flex-none rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50',
        checked ? 'bg-brand' : 'bg-line',
        className,
      )}
      {...props}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  ),
);
Switch.displayName = 'Switch';

export { Switch };
