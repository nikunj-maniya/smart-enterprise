import * as React from 'react';
import { Hash, MessageSquare, Save, Zap } from 'lucide-react';
import type { SlackConfigDto, SlackConfigStatus } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Toast, useToast } from '@/components/ui/toast';
import {
  ApiError,
  connectSlack,
  disconnectSlack,
  getSlackConfig,
  testSlackConnection,
  updateSlackSettings,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorState } from '@/pages/requests/shared';

/** Bottom-center toggle switch — mirrors the console Settings page's convention. */
function Toggle({ checked, disabled, onClick }: { checked: boolean; disabled?: boolean; onClick: () => void }) {
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

const STATUS_STYLE: Record<SlackConfigStatus, { label: string; bg: string; fg: string; dot: string }> = {
  connected: { label: 'Connected', bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
  disconnected: { label: 'Disconnected', bg: 'rgb(241,242,242)', fg: 'var(--ink-500)', dot: 'var(--ink-400)' },
  error: { label: 'Error', bg: 'rgb(254,235,236)', fg: 'rgb(229,72,77)', dot: 'rgb(229,72,77)' },
};

function StatusBadge({ status }: { status: SlackConfigStatus }) {
  const c = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-[6px] rounded-full px-[10px] py-1 text-xs font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function TextField({
  label,
  value,
  onChange,
  icon: Icon,
  disabled,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  icon?: typeof Hash;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-ink-700">{label}</div>
      <div className="relative mt-1.5">
        {Icon && (
          <Icon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={`h-10 w-full rounded-sm border border-line bg-surface text-sm text-ink-900 outline-none focus:border-brand disabled:bg-app-bg disabled:text-ink-400 ${
            Icon ? 'pl-8 pr-3' : 'px-3'
          }`}
        />
      </div>
    </label>
  );
}

/** Slack Integration admin (slack-integration spec, Enterprise Admin only): connect/disconnect the
 * tenant's Slack workspace and configure request/approval/digest/reminder notification settings. */
export default function SlackIntegration() {
  const { user } = useAuth();
  const [config, setConfig] = React.useState<SlackConfigDto | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const { message, show } = useToast();

  const [showConnectForm, setShowConnectForm] = React.useState(false);
  const [botToken, setBotToken] = React.useState('');
  const [signingSecret, setSigningSecret] = React.useState('');
  const [connectChannel, setConnectChannel] = React.useState('');
  const [connecting, setConnecting] = React.useState(false);
  const [connectError, setConnectError] = React.useState<string | null>(null);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  const [defaultChannel, setDefaultChannel] = React.useState('');
  const [notifyApproversOnNewRequest, setNotifyApproversOnNewRequest] = React.useState(false);
  const [notifyRequesterOnDecision, setNotifyRequesterOnDecision] = React.useState(false);
  const [notifyRequesterOnStatusChange, setNotifyRequesterOnStatusChange] = React.useState(false);
  const [digestEnabled, setDigestEnabled] = React.useState(false);
  const [digestChannel, setDigestChannel] = React.useState('');
  const [digestTime, setDigestTime] = React.useState('');
  const [reminderEnabled, setReminderEnabled] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);

  const load = React.useCallback(() => {
    setLoadError(null);
    getSlackConfig()
      .then(setConfig)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Unable to load Slack configuration.'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!config) return;
    setDefaultChannel(config.defaultChannel ?? '');
    setNotifyApproversOnNewRequest(config.notifyApproversOnNewRequest);
    setNotifyRequesterOnDecision(config.notifyRequesterOnDecision);
    setNotifyRequesterOnStatusChange(config.notifyRequesterOnStatusChange);
    setDigestEnabled(config.digestEnabled);
    setDigestChannel(config.digestChannel ?? '');
    setDigestTime(config.digestTime ?? '');
    setReminderEnabled(config.reminderEnabled);
  }, [config]);

  async function onConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const updated = await connectSlack({
        botToken,
        signingSecret,
        defaultChannel: connectChannel.trim(),
      });
      setConfig(updated);
      setShowConnectForm(false);
      setBotToken('');
      setSigningSecret('');
      setConnectChannel('');
      show('Slack workspace connected.');
    } catch (err) {
      setConnectError(err instanceof ApiError ? err.message : 'Could not verify these Slack credentials.');
    } finally {
      setConnecting(false);
    }
  }

  async function onDisconnect() {
    setDisconnecting(true);
    setActionError(null);
    try {
      setConfig(await disconnectSlack());
      show('Slack workspace disconnected.');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Unable to disconnect this workspace.');
    } finally {
      setDisconnecting(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setActionError(null);
    try {
      await testSlackConnection();
      show('Test message sent to Slack.');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Unable to send a test message.');
    } finally {
      setTesting(false);
    }
  }

  async function onSaveSettings() {
    setSavingSettings(true);
    setActionError(null);
    try {
      const updated = await updateSlackSettings({
        defaultChannel: defaultChannel.trim() || undefined,
        notifyApproversOnNewRequest,
        notifyRequesterOnDecision,
        notifyRequesterOnStatusChange,
        digestEnabled,
        digestChannel: digestEnabled ? digestChannel.trim() || undefined : null,
        digestTime: digestEnabled ? digestTime || undefined : null,
        reminderEnabled,
      });
      setConfig(updated);
      show('Slack settings saved.');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Unable to save these settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Slack Integration"
        subtitle="Push request and approval notifications into Slack. When connected, approvers get a DM with Approve/Reject actions."
        breadcrumb={`Configuration · ${user?.tenantName ?? ''}`}
      />

      {loadError ? (
        <div className="mt-[22px] max-w-[680px]">
          <ErrorState message={loadError} onRetry={load} />
        </div>
      ) : !config ? (
        <div className="mt-[22px] max-w-[680px] rounded-[14px] border border-line-soft bg-surface p-8 text-center text-sm text-ink-400 shadow-card">
          Loading…
        </div>
      ) : (
        <div className="mt-[22px] flex max-w-[680px] flex-col gap-[18px]">
          <div className="rounded-[14px] border border-line-soft bg-surface p-6 shadow-card">
            <div className="flex items-center gap-[14px]">
              <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[13px] bg-[rgb(236,245,246)]">
                <MessageSquare size={26} className="text-brand" />
              </div>
              <div className="flex-1">
                <div className="text-base font-bold text-ink-900">
                  {config.workspaceName ? `${config.workspaceName} workspace` : 'No workspace connected'}
                </div>
                <div className="mt-[3px]">
                  <StatusBadge status={config.status} />
                </div>
                {config.status === 'error' && config.lastErrorMessage && (
                  <div className="mt-[6px] text-xs text-danger">{config.lastErrorMessage}</div>
                )}
              </div>
              <div className="flex flex-none flex-col items-end gap-2">
                {config.status === 'connected' ? (
                  <Button variant="secondary" size="sm" onClick={onDisconnect} disabled={disconnecting}>
                    {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                ) : (
                  !showConnectForm && (
                    <Button variant="secondary" size="sm" onClick={() => setShowConnectForm(true)}>
                      Connect
                    </Button>
                  )
                )}
                {config.status === 'connected' && (
                  <Button variant="secondary" size="sm" onClick={onTest} disabled={testing}>
                    <Zap size={14} />
                    {testing ? 'Testing…' : 'Test connection'}
                  </Button>
                )}
              </div>
            </div>

            {showConnectForm && config.status !== 'connected' && (
              <div className="mt-[18px] flex flex-col gap-3 border-t border-line-soft pt-[18px]">
                <TextField
                  label="Bot token"
                  type="password"
                  value={botToken}
                  onChange={setBotToken}
                  placeholder="xoxb-…"
                />
                <TextField
                  label="Signing secret"
                  type="password"
                  value={signingSecret}
                  onChange={setSigningSecret}
                />
                <TextField
                  label="Default channel"
                  icon={Hash}
                  value={connectChannel}
                  onChange={setConnectChannel}
                  placeholder="general"
                />
                {connectError && <div className="text-xs font-medium text-danger">{connectError}</div>}
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onConnect}
                    disabled={connecting || !botToken.trim() || !signingSecret.trim() || !connectChannel.trim()}
                  >
                    {connecting ? 'Connecting…' : 'Connect'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowConnectForm(false);
                      setConnectError(null);
                      setBotToken('');
                      setSigningSecret('');
                      setConnectChannel('');
                    }}
                    disabled={connecting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[14px] border border-line-soft bg-surface p-6 shadow-card">
            <div className="text-[15px] font-bold text-ink-900">Workspace configuration</div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <TextField label="Workspace name" value={config.workspaceName ?? ''} disabled placeholder="Not connected" />
              <TextField label="Default channel" icon={Hash} value={defaultChannel} onChange={setDefaultChannel} />
            </div>
          </div>

          <div className="rounded-[14px] border border-line-soft bg-surface p-6 shadow-card">
            <div className="text-[15px] font-bold text-ink-900">Notifications</div>
            <div className="mt-3 flex flex-col">
              <div className="flex items-center justify-between gap-4 border-b border-line-soft py-[14px]">
                <div>
                  <div className="text-[13px] font-semibold text-ink-900">Notify approvers on new request</div>
                  <div className="text-xs text-ink-400">DM with Approve / Reject buttons</div>
                </div>
                <Toggle
                  checked={notifyApproversOnNewRequest}
                  onClick={() => setNotifyApproversOnNewRequest((v) => !v)}
                />
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-line-soft py-[14px]">
                <div>
                  <div className="text-[13px] font-semibold text-ink-900">Notify requester on decision</div>
                  <div className="text-xs text-ink-400">Approved / rejected updates</div>
                </div>
                <Toggle checked={notifyRequesterOnDecision} onClick={() => setNotifyRequesterOnDecision((v) => !v)} />
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-line-soft py-[14px]">
                <div>
                  <div className="text-[13px] font-semibold text-ink-900">Notify requester on status change</div>
                  <div className="text-xs text-ink-400">Any other status transition, e.g. fulfilment updates</div>
                </div>
                <Toggle
                  checked={notifyRequesterOnStatusChange}
                  onClick={() => setNotifyRequesterOnStatusChange((v) => !v)}
                />
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-line-soft py-[14px]">
                <div>
                  <div className="text-[13px] font-semibold text-ink-900">Daily absence digest</div>
                  <div className="text-xs text-ink-400">Posts who's away at a set time each morning</div>
                </div>
                <Toggle checked={digestEnabled} onClick={() => setDigestEnabled((v) => !v)} />
              </div>
              <div className="flex items-center justify-between gap-4 py-[14px]">
                <div>
                  <div className="text-[13px] font-semibold text-ink-900">Daily pending-approval reminder</div>
                  <div className="text-xs text-ink-400">Nudges approvers who still have requests waiting</div>
                </div>
                <Toggle checked={reminderEnabled} onClick={() => setReminderEnabled((v) => !v)} />
              </div>

              {digestEnabled && (
                <div className="mt-2 grid grid-cols-2 gap-4 rounded-[10px] bg-app-bg p-4">
                  <TextField label="Digest channel" icon={Hash} value={digestChannel} onChange={setDigestChannel} />
                  <TextField label="Post at" type="time" value={digestTime} onChange={setDigestTime} />
                </div>
              )}
            </div>
          </div>

          {actionError && <div className="text-sm font-medium text-danger">{actionError}</div>}

          <div className="flex justify-end">
            <Button variant="secondary" onClick={onSaveSettings} disabled={savingSettings}>
              <Save size={14} />
              {savingSettings ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        </div>
      )}

      <Toast message={message} />
    </>
  );
}
