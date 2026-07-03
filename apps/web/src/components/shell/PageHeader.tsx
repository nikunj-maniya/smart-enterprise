export function PageHeader({
  title,
  subtitle,
  breadcrumb = 'Platform · System Admin',
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
}) {
  return (
    <div>
      <div className="text-[13px] text-ink-400">{breadcrumb}</div>
      <div className="mt-[5px] text-[26px] font-bold tracking-[-.4px]">{title}</div>
      {subtitle && <div className="mt-2 max-w-[620px] text-sm text-ink-400">{subtitle}</div>}
    </div>
  );
}
