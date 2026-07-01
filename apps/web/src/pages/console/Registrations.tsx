import { PageHeader } from '@/components/shell/PageHeader';
import { Placeholder } from '@/components/shell/Placeholder';

export default function Registrations() {
  return (
    <>
      <PageHeader
        title="Enterprise Registrations"
        subtitle="Review incoming enterprise sign-ups. Accepting activates the pre-created Enterprise Admin account; rejecting captures a reason."
      />
      <Placeholder note="Registration queue, review modal, and accept/reject land in Slice 2." />
    </>
  );
}
