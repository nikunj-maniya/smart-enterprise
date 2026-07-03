import { PageHeader } from '@/components/shell/PageHeader';
import { Placeholder } from '@/components/shell/Placeholder';
import { useAuth } from '@/lib/auth';

export default function Projects() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Assign a Project Manager, Tech Lead, and members. Drives Leave/WFH approver auto-routing."
        breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
      />
      <Placeholder note="Projects Master is coming in Slice 6." />
    </>
  );
}
