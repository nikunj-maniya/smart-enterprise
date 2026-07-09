import * as React from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal scrim + card. Closes on Esc/scrim click (per design) and traps Tab focus within the
 * card so keyboard users can't tab out to the page behind it; focus returns to the trigger on close. */
export function Overlay({
  children,
  onClose,
  z = 50,
}: {
  children: React.ReactNode;
  onClose: () => void;
  z?: number;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<Element | null>(null);

  React.useEffect(() => {
    triggerRef.current = document.activeElement;
    const first = cardRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const [firstEl, lastEl] = [focusable[0], focusable[focusable.length - 1]];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6"
      style={{ background: 'rgba(10,20,20,.5)', zIndex: z }}
      onClick={onClose}
    >
      <div ref={cardRef} role="dialog" aria-modal="true" className="w-full" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
