import { PageHeader } from '@/components/shell/PageHeader';
import { Placeholder } from '@/components/shell/Placeholder';
import { useAuth } from '@/lib/auth';

export default function Departments() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="Groups used across request routing. Each has a head and a member count."
        breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
      />
      <Placeholder note="Departments Master is coming in Slice 2." />
    </>
  );
}
