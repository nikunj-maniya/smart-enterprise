import { PageHeader } from '@/components/shell/PageHeader';
import { Placeholder } from '@/components/shell/Placeholder';
import { useAuth } from '@/lib/auth';

export default function Roles() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Roles are permission bundles. System roles are seeded and can't be deleted; custom roles are fully yours."
        breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
      />
      <Placeholder note="Roles & Permissions Master is coming in Slice 3." />
    </>
  );
}
