import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, MapPin, Briefcase, Lock, Check, User } from 'lucide-react';
import type { NotificationPreferenceRow, ProfileDto, UpdateProfileRequest } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError, getNotificationPreferences, updateNotificationPreference } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const CARD = 'rounded-[14px] border border-line-soft bg-surface p-6 shadow-card';
const SECTION_TITLE = 'text-[15px] font-bold text-ink-900';

/** Editable labeled input matching the design's field style. */
function Field({
  label,
  value,
  onChange,
  icon,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: React.ReactNode;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink-900">{label}</span>
      <div className="flex h-11 items-center gap-2 rounded-sm border border-line bg-surface px-3">
        {icon && <span className="flex flex-none text-ink-300">{icon}</span>}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
        />
      </div>
    </label>
  );
}

/** Read-only labeled value (admin-managed fields: email, roles, departments). */
function ReadOnlyField({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink-900">{label}</span>
      <div className="flex min-h-11 items-center gap-2 rounded-sm border border-line-soft bg-app-bg px-3 py-2">
        {icon && <span className="flex flex-none text-ink-300">{icon}</span>}
        <span className="min-w-0 flex-1 text-sm text-ink-500">{value}</span>
      </div>
    </div>
  );
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <span className="text-sm text-ink-400">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((it) => (
        <span
          key={it}
          className="inline-flex items-center rounded-full bg-surface-muted px-[9px] py-[2px] text-[12px] font-medium text-ink-700"
        >
          {it}
        </span>
      ))}
    </span>
  );
}

/** Bottom-center toggle switch — mirrors the Leave Policy page's convention. */
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

export default function Profile() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = React.useState<ProfileDto | null>(null);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [jobTitle, setJobTitle] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [savingInfo, setSavingInfo] = React.useState(false);
  const [infoError, setInfoError] = React.useState<string | null>(null);
  const [infoSaved, setInfoSaved] = React.useState(false);

  const [prefs, setPrefs] = React.useState<NotificationPreferenceRow[] | null>(null);
  const [prefsError, setPrefsError] = React.useState<string | null>(null);
  const [savingPrefKey, setSavingPrefKey] = React.useState<string | null>(null);

  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwSaved, setPwSaved] = React.useState(false);
  const [savingPw, setSavingPw] = React.useState(false);
  const { changePassword } = useAuth();

  React.useEffect(() => {
    apiFetch<ProfileDto>('/profile')
      .then((p) => {
        setProfile(p);
        setName(p.name);
        setPhone(p.phone ?? '');
        setJobTitle(p.jobTitle ?? '');
        setLocation(p.location ?? '');
      })
      .catch((err) => setProfileError(err instanceof ApiError ? err.message : 'Unable to load your profile.'));
    getNotificationPreferences()
      .then((res) => setPrefs(res.rows))
      .catch((err) => setPrefsError(err instanceof ApiError ? err.message : 'Unable to load notification preferences.'));
  }, []);

  async function onTogglePreference(row: NotificationPreferenceRow, channel: 'inApp' | 'slack') {
    const key = `${row.type}:${channel}`;
    setSavingPrefKey(key);
    setPrefsError(null);
    try {
      const res = await updateNotificationPreference({ type: row.type, channel, enabled: !row[channel] });
      setPrefs(res.rows);
    } catch (err) {
      setPrefsError(err instanceof ApiError ? err.message : 'Unable to update this preference.');
    } finally {
      setSavingPrefKey(null);
    }
  }

  async function onSaveInfo() {
    setInfoError(null);
    setInfoSaved(false);
    if (!name.trim()) return setInfoError('Name is required.');
    setSavingInfo(true);
    try {
      const body: UpdateProfileRequest = {
        name,
        phone: phone || null,
        jobTitle: jobTitle || null,
        location: location || null,
      };
      const updated = await apiFetch<ProfileDto>('/profile', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setProfile(updated);
      setInfoSaved(true);
      await refresh(); // update the name shown in the top bar / sidebar
    } catch (err) {
      setInfoError(err instanceof ApiError ? err.message : 'Unable to save your profile.');
    } finally {
      setSavingInfo(false);
    }
  }

  async function onChangePassword() {
    setPwError(null);
    setPwSaved(false);
    if (next.length < 8) return setPwError('New password must be at least 8 characters.');
    if (next !== confirm) return setPwError('New password and confirmation do not match.');
    setSavingPw(true);
    try {
      await changePassword(current, next);
      setPwSaved(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Unable to change your password.');
    } finally {
      setSavingPw(false);
    }
  }

  if (!profile) {
    return (
      <>
        <PageHeader title="My Profile" breadcrumb="Account" />
        {profileError ? (
          <div className="mt-6 text-sm font-medium text-danger">{profileError}</div>
        ) : (
          <div className="mt-6 text-sm text-ink-400">Loading…</div>
        )}
      </>
    );
  }

  const subtitle = [jobTitle, profile.departments.join(', ')].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader title="My Profile" breadcrumb="Account" />

      {/* Avatar header */}
      <div className={`mt-[22px] flex items-center gap-[18px] ${CARD}`}>
        <div className="flex h-[68px] w-[68px] flex-none items-center justify-center rounded-[18px] bg-[rgb(236,245,246)] text-[24px] font-bold text-brand">
          {initials(profile.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[19px] font-bold text-ink-900">{profile.name}</div>
          <div className="mt-[3px] text-[13px] text-ink-400">{subtitle || profile.email}</div>
        </div>
      </div>

      {/* Personal information */}
      <div className={`mt-[18px] ${CARD}`}>
        <div className={SECTION_TITLE}>Personal information</div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Field label="Full name" value={name} onChange={setName} icon={<User size={16} />} />
          <ReadOnlyField label="Email" value={profile.email} icon={<Mail size={16} />} />
          <Field
            label="Phone"
            value={phone}
            onChange={setPhone}
            icon={<Phone size={16} />}
            placeholder="e.g. +91 98765 43210"
          />
          <Field
            label="Job title"
            value={jobTitle}
            onChange={setJobTitle}
            icon={<Briefcase size={16} />}
            placeholder="e.g. Senior Engineer"
          />
          <Field
            label="Location"
            value={location}
            onChange={setLocation}
            icon={<MapPin size={16} />}
            placeholder="e.g. Ahmedabad"
          />
          <ReadOnlyField label="Roles" value={<Chips items={profile.roles} empty="No roles" />} />
          <ReadOnlyField
            label="Departments"
            value={<Chips items={profile.departments} empty="No departments" />}
          />
        </div>
        <div className="mt-3 text-[12px] text-ink-400">
          Email, roles, and departments are managed by your administrator.
        </div>
        {infoError && <div className="mt-3 text-sm font-medium text-danger">{infoError}</div>}
        {infoSaved && !infoError && (
          <div className="mt-3 text-sm font-medium text-success">Profile saved.</div>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => navigate('/')}>
            Cancel
          </Button>
          <Button onClick={onSaveInfo} disabled={savingInfo}>
            <Check size={16} />
            {savingInfo ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Notification preferences (reporting-and-polish) — per type, per channel; mandatory
          types (e.g. "needs your approval") can't be muted on any channel. */}
      <div className={`mt-[18px] ${CARD}`}>
        <div className={SECTION_TITLE}>Notification preferences</div>
        {prefs === null ? (
          <div className="mt-4 text-sm text-ink-400">Loading…</div>
        ) : (
          <div className="mt-2 flex flex-col">
            <div className="grid grid-cols-[1fr_90px_90px] items-center gap-3 pb-2 text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
              <span />
              <span className="text-center">In-app</span>
              <span className="text-center">Slack</span>
            </div>
            {prefs.map((row) => (
              <div
                key={row.type}
                className="grid grid-cols-[1fr_90px_90px] items-center gap-3 border-b border-line-soft py-[14px] last:border-b-0"
              >
                <div>
                  <div className="text-[13px] font-semibold text-ink-900">{row.label}</div>
                  {row.mandatory && <div className="text-[12px] text-ink-400">Mandatory — cannot be muted</div>}
                </div>
                <div className="flex justify-center">
                  <Toggle
                    checked={row.inApp}
                    disabled={row.mandatory || savingPrefKey === `${row.type}:inApp`}
                    onClick={() => onTogglePreference(row, 'inApp')}
                  />
                </div>
                <div className="flex justify-center">
                  <Toggle
                    checked={row.slack}
                    disabled={row.mandatory || savingPrefKey === `${row.type}:slack`}
                    onClick={() => onTogglePreference(row, 'slack')}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {prefsError && <div className="mt-3 text-sm font-medium text-danger">{prefsError}</div>}
      </div>

      {/* Change password */}
      <div className={`mt-[18px] ${CARD}`}>
        <div className={SECTION_TITLE}>Change password</div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Field
            label="Current password"
            type="password"
            value={current}
            onChange={setCurrent}
            icon={<Lock size={16} />}
          />
          <div />
          <Field
            label="New password"
            type="password"
            value={next}
            onChange={setNext}
            icon={<Lock size={16} />}
          />
          <Field
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            icon={<Lock size={16} />}
          />
        </div>
        {pwError && <div className="mt-3 text-sm font-medium text-danger">{pwError}</div>}
        {pwSaved && !pwError && (
          <div className="mt-3 text-sm font-medium text-success">Password updated.</div>
        )}
        <div className="mt-5 flex justify-end">
          <Button onClick={onChangePassword} disabled={savingPw}>
            <Lock size={16} />
            {savingPw ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </div>
    </div>
  );
}
