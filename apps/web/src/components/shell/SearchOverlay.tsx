import * as React from 'react';
import { Search } from 'lucide-react';

/** Command-style search overlay (matches the design). Results wiring lands in a later slice. */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery('');
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-6 pb-6 pt-[90px]"
      style={{ background: 'rgba(10,20,20,.5)', animation: 'seFade .15s ease' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-[14px] bg-surface shadow-xl"
        style={{ animation: 'seUp .2s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-[11px] border-b border-line-soft px-[18px] py-4">
          <Search size={20} className="text-ink-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search enterprises, users…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-base text-ink-900 outline-none"
          />
          <span
            className="cursor-pointer rounded-md border border-line px-[7px] py-[3px] text-[11px] font-semibold text-ink-400"
            onClick={onClose}
          >
            Esc
          </span>
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          <div className="px-[18px] py-8 text-center text-[13px] text-ink-400">
            {query
              ? 'No matches found.'
              : 'Start typing to search across enterprises, users…'}
          </div>
        </div>
      </div>
    </div>
  );
}
