import * as React from 'react';

export function Overlay({
  children,
  onClose,
  z = 50,
}: {
  children: React.ReactNode;
  onClose: () => void;
  z?: number;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6"
      style={{ background: 'rgba(10,20,20,.5)', zIndex: z }}
      onClick={onClose}
    >
      <div className="w-full" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
