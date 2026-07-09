import * as React from 'react';

/** Bottom-center success toast (design's post-action confirmation), auto-dismissing. */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg px-5 py-3 text-sm font-medium text-white shadow-xl"
      style={{ background: '#11302f' }}
    >
      {message}
    </div>
  );
}

/** Shows `message` for `duration`ms, then clears it — one toast at a time. */
export function useToast(duration = 3000) {
  const [message, setMessage] = React.useState<string | null>(null);
  const show = React.useCallback(
    (msg: string) => {
      setMessage(msg);
      window.setTimeout(() => setMessage(null), duration);
    },
    [duration],
  );
  return { message, show };
}
