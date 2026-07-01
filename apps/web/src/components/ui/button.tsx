import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand text-brand-ink border border-brand hover:bg-brand-hover',
        secondary: 'bg-surface text-ink-900 border border-line hover:bg-surface-muted',
        outline: 'bg-transparent text-brand border border-brand hover:bg-brand/5',
        ghost: 'bg-transparent text-brand border border-transparent hover:bg-brand/5',
        danger: 'bg-danger text-white border border-danger hover:opacity-90',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-[13px]',
        default: 'h-10 gap-2 px-4 text-sm',
        lg: 'h-12 gap-2 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), fullWidth && 'w-full', className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
