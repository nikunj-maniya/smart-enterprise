import * as React from 'react';

/** Icon + input row used across the auth screens (matches the design). */
export function AuthField({
  label,
  icon,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  icon?: React.ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex w-full flex-col gap-2">
      <span className="text-sm font-semibold text-ink-900">{label}</span>
      <div className="flex h-[46px] items-center gap-[9px] rounded-sm border border-line bg-surface px-[13px]">
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
