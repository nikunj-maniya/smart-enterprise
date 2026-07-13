import * as React from 'react';
import { WifiOff } from 'lucide-react';

/** PWA baseline (reporting-and-polish): a clear, persistent indicator when offline — the
 *  installed shell still renders from cache, but live data needs a connection. */
export function OfflineBanner() {
  const [online, setOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-semibold text-white"
      style={{ background: 'rgb(229,72,77)' }}
    >
      <WifiOff size={15} />
      You're offline — showing the last loaded data. Some actions won't work until you reconnect.
    </div>
  );
}
