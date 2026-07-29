import * as React from 'react';

export type ToastVariant = 'success' | 'error';

const VARIANT_BACKGROUND: Record<ToastVariant, string> = {
  success: '#11302f',
  error: 'rgb(229, 72, 77)', // --danger (index.css)
};

/** Bottom-center toast (design's post-action confirmation), auto-dismissing. Defaults to the
 *  success styling so existing callers that don't pass `variant` are unaffected. */
export function Toast({ message, variant = 'success' }: { message: string | null; variant?: ToastVariant }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg px-5 py-3 text-sm font-medium text-white shadow-xl"
      style={{ background: VARIANT_BACKGROUND[variant] }}
    >
      {message}
    </div>
  );
}

/** Shows `message` (success by default, or as an `error` toast) for `duration`ms, then clears it
 *  — one toast at a time. */
export function useToast(duration = 3000) {
  const [message, setMessage] = React.useState<string | null>(null);
  const [variant, setVariant] = React.useState<ToastVariant>('success');
  const show = React.useCallback(
    (msg: string, v: ToastVariant = 'success') => {
      setVariant(v);
      setMessage(msg);
      window.setTimeout(() => setMessage(null), duration);
    },
    [duration],
  );
  return { message, variant, show };
}
