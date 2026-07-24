import * as React from 'react';
import type { PlatformSettings } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { apiFetch, ApiError } from '@/lib/api';

const TOGGLES: { key: keyof PlatformSettings; label: string; hint: string }[] = [
  {
    key: 'forcePasswordChangeOnFirstLogin',
    label: 'Force password change on first login',
    hint: 'Recommended for production',
  },
  {
    key: 'allowPublicRegistration',
    label: 'Allow public enterprise registration',
    hint: 'Anyone can submit; only System Admin accepts',
  },
  {
    key: 'notifyOnNewRegistration',
    label: 'Notify on new registration',
    hint: 'In-app alert to the review queue',
  },
];

function Toggle({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-60 ${
        checked ? 'bg-brand' : 'bg-ink-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function Settings() {
  const [settings, setSettings] = React.useState<PlatformSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingKey, setSavingKey] = React.useState<keyof PlatformSettings | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<PlatformSettings>('/settings');
        setSettings(res);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unable to load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onToggle(key: keyof PlatformSettings) {
    if (!settings) return;
    const previous = settings[key];
    setSettings({ ...settings, [key]: !previous });
    setSavingKey(key);
    setError(null);
    try {
      await apiFetch<PlatformSettings>('/settings', {
        method: 'PUT',
        body: JSON.stringify({ [key]: !previous }),
      });
    } catch (err) {
      setSettings((current) => (current ? { ...current, [key]: previous } : current));
      setError(err instanceof ApiError ? err.message : 'Unable to update settings.');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <>
      <PageHeader title="Platform Settings" />

      <div className="mt-[22px] max-w-[680px] rounded-lg border border-line-soft bg-surface p-6 shadow-card">
        <div className="text-[15px] font-bold text-ink-900">Default System Admin</div>
        <div className="mt-1.5 text-[13px] leading-[1.6] text-ink-400">
          The platform ships with one pre-seeded System Admin. The default credential must be
          force-changed on first login before production.
        </div>

        {loading && <div className="px-4 py-12 text-center text-sm text-ink-400">Loading…</div>}

        {!loading && settings && (
          <div className="mt-[18px] flex flex-col gap-[14px]">
            {TOGGLES.map((toggle, index) => (
              <div
                key={toggle.key}
                className={`flex items-center justify-between py-[14px] ${
                  index < TOGGLES.length - 1 ? 'border-b border-line-soft' : ''
                }`}
              >
                <div>
                  <div className="text-[13px] font-semibold text-ink-900">{toggle.label}</div>
                  <div className="text-xs text-ink-400">{toggle.hint}</div>
                </div>
                <Toggle
                  checked={settings[toggle.key]}
                  disabled={savingKey === toggle.key}
                  onClick={() => onToggle(toggle.key)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="mt-3 text-sm font-medium text-danger">{error}</div>}
    </>
  );
}
