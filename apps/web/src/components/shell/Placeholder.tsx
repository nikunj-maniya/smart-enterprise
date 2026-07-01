export function Placeholder({ note }: { note: string }) {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-line bg-surface p-12 text-center">
      <div className="text-sm text-ink-400">{note}</div>
    </div>
  );
}
