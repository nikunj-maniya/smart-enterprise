import * as React from 'react';
import { Building2, Globe, Check, ChevronDown } from 'lucide-react';
import {
  COMPANY_SIZE_OPTIONS,
  INDUSTRY_OPTIONS,
  type EnterpriseDetailsDto,
  type UpdateEnterpriseDetailsRequest,
} from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const CARD = 'rounded-[14px] border border-line-soft bg-surface p-6 shadow-card';
const SECTION_TITLE = 'text-[15px] font-bold text-ink-900';

/** Editable labeled input matching the design's field style (mirrors Profile.tsx's Field). */
function Field({
  label,
  value,
  onChange,
  icon,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink-900">{label}</span>
      <div className="flex h-11 items-center gap-2 rounded-sm border border-line bg-surface px-3">
        {icon && <span className="flex flex-none text-ink-300">{icon}</span>}
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
        />
      </div>
    </label>
  );
}

/** Dropdown matching the Registration form's Select field (same fixed option lists — Industry/Company size must stay consistent between the two forms). */
function Select({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  // A legacy value saved before the canonical list changed still needs to display and re-save cleanly.
  const allOptions = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink-900">{label}</span>
      <div className="relative flex items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-11 w-full appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm outline-none ${
            value ? 'text-ink-900' : 'text-ink-300'
          }`}
        >
          <option value="" disabled hidden>
            {placeholder}
          </option>
          {allOptions.map((o) => (
            <option key={o} value={o} className="text-ink-900">
              {o}
            </option>
          ))}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
      </div>
    </label>
  );
}

export default function CompanyDetails() {
  const { user } = useAuth();
  const [details, setDetails] = React.useState<EnterpriseDetailsDto | null>(null);
  const [name, setName] = React.useState('');
  const [industry, setIndustry] = React.useState('');
  const [size, setSize] = React.useState('');
  const [website, setWebsite] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<EnterpriseDetailsDto>('/enterprise-profile')
      .then((d) => {
        setDetails(d);
        setName(d.name);
        setIndustry(d.industry ?? '');
        setSize(d.size ?? '');
        setWebsite(d.website ?? '');
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Unable to load company details.'));
  }, []);

  async function onSave() {
    setError(null);
    setSaved(false);
    if (!name.trim()) return setError('Company name is required.');
    setSaving(true);
    try {
      const body: UpdateEnterpriseDetailsRequest = {
        name,
        industry: industry || null,
        size: size || null,
        website: website || null,
      };
      const updated = await apiFetch<EnterpriseDetailsDto>('/enterprise-profile', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setDetails(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save company details.');
    } finally {
      setSaving(false);
    }
  }

  if (!details) {
    return (
      <>
        <PageHeader
          title="Company Details"
          breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
        />
        <div className={`mt-6 text-sm ${loadError ? 'font-medium text-danger' : 'text-ink-400'}`}>
          {loadError ?? 'Loading…'}
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title="Company Details"
        subtitle="Your enterprise's profile. Visible to your organization; not editable by the platform."
        breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
      />

      <div className={`mt-[22px] ${CARD}`}>
        <div className={SECTION_TITLE}>Company information</div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Field
            label="Company name"
            value={name}
            onChange={setName}
            icon={<Building2 size={16} />}
          />
          <Select label="Industry" value={industry} onChange={setIndustry} options={INDUSTRY_OPTIONS} />
          <Select
            label="Company size"
            value={size}
            onChange={setSize}
            options={COMPANY_SIZE_OPTIONS}
          />
          <Field
            label="Website"
            value={website}
            onChange={setWebsite}
            icon={<Globe size={16} />}
            placeholder="e.g. https://acme.com"
          />
        </div>
        {error && <div className="mt-3 text-sm font-medium text-danger">{error}</div>}
        {saved && !error && (
          <div className="mt-3 text-sm font-medium text-success">Company details saved.</div>
        )}
        <div className="mt-5 flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            <Check size={16} />
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
