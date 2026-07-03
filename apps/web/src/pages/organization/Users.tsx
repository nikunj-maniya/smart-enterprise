import { PageHeader } from '@/components/shell/PageHeader';
import { Placeholder } from '@/components/shell/Placeholder';
import { useAuth } from '@/lib/auth';

export default function OrgUsers() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Add employees directly or share a self-registration link. Manage roles, departments, and access."
        breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
      />
      <Placeholder note="User Master is coming in Slice 4." />
    </>
  );
}
