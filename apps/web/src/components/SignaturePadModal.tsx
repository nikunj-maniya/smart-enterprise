import * as React from 'react';
import { Check, Eraser } from 'lucide-react';
import { Overlay } from '@/components/ui/overlay';
import { Button } from '@/components/ui/button';

/**
 * Signature capture at Front Desk check-in (visitor-signatures spec) — a canvas the visitor signs
 * on, plus the privacy-consent acknowledgement, before confirming. `onConfirm` gets the canvas as
 * a `data:image/png;base64,...` URL (decoded and written to object storage server-side).
 */
export function SignaturePadModal({
  visitorName,
  onCancel,
  onConfirm,
  submitting,
  error,
}: {
  visitorName: string;
  onCancel: () => void;
  onConfirm: (signature: string, consent: boolean) => void;
  submitting: boolean;
  error: string | null;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const [hasStroke, setHasStroke] = React.useState(false);
  const [consent, setConsent] = React.useState(false);

  function point(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgb(0, 0, 0)';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  }

  function onPointerUp() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onConfirm(canvas.toDataURL('image/png'), consent);
  }

  return (
    <Overlay onClose={onCancel} z={60}>
      <div className="mx-auto w-full max-w-[480px] rounded-[16px] bg-surface p-6 shadow-xl">
        <div className="text-[16px] font-bold text-ink-900">Sign in — {visitorName}</div>
        <div className="mt-1 text-[13px] text-ink-400">Please sign below to confirm check-in.</div>

        <canvas
          ref={canvasRef}
          width={432}
          height={180}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="mt-4 w-full touch-none rounded-sm border border-line bg-app-bg"
        />
        <button
          type="button"
          onClick={clear}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-700"
        >
          <Eraser size={13} />
          Clear
        </button>

        <label className="mt-4 flex items-start gap-2 text-[13px] text-ink-700">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-[3px]" />
          I acknowledge and consent to the site's privacy policy.
        </label>

        {error && <div className="mt-3 text-sm font-medium text-danger">{error}</div>}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!hasStroke || !consent || submitting}>
            <Check size={16} />
            {submitting ? 'Checking in…' : 'Confirm check-in'}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
