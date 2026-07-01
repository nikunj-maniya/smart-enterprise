import { PageHeader } from '@/components/shell/PageHeader';
import { Placeholder } from '@/components/shell/Placeholder';

export default function Overview() {
  return (
    <>
      <PageHeader title="Platform Overview" />
      <Placeholder note="Metrics, latest registrations, and recent activity land in Slice 3." />
    </>
  );
}
