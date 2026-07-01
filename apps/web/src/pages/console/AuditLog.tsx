import { PageHeader } from '@/components/shell/PageHeader';
import { Placeholder } from '@/components/shell/Placeholder';

export default function AuditLog() {
  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Immutable record of platform actions. Every accept, reject, and status change is captured."
      />
      <Placeholder note="Audit log view lands in Slice 6 (entries are written starting in Slice 2)." />
    </>
  );
}
